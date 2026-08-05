import { CONFIG } from '../config.js';
import { findRelatedMarkets } from '../externalPrice.js';
import { logSignal } from '../logger.js';
import { calculatePositionSize, canTakeExposure, recordExposure } from '../risk.js';
import type { Trader } from '../trader.js';
import type { ArbitrageSignal, MarketData } from '../types.js';

export async function checkCorrelation(
  market: MarketData,
  allMarkets: MarketData[],
  trader: Trader,
): Promise<ArbitrageSignal | null> {
  const related = findRelatedMarkets(market, allMarkets);
  if (related.length === 0) return null;

  let bestGap = 0;
  let bestRelated: (typeof related)[0] | null = null;

  for (const other of related) {
    const gap = Math.abs(market.yesPrice - other.yesPrice);
    if (gap > bestGap) {
      bestGap = gap;
      bestRelated = other;
    }
  }

  if (!bestRelated || bestGap < CONFIG.minEdge) return null;

  const size = calculatePositionSize(bestGap, market.liquidity);
  if (!canTakeExposure(size)) return null;

  const buyUnderpriced = market.yesPrice < bestRelated.yesPrice;
  const tokenId = buyUnderpriced ? market.yesTokenId : market.noTokenId;
  const price = buyUnderpriced ? market.yesPrice : market.noPrice;
  const shares = Math.max(5, size / Math.max(price, 0.01));

  logSignal(
    'correlation',
    `${(bestGap * 100).toFixed(2)}% gap vs related market on "${market.question.slice(0, 50)}..."`,
  );

  await trader.placeOrder({
    market,
    tokenId,
    side: 'BUY',
    price,
    size: shares,
    reason: `correlation vs ${bestRelated.slug}`,
  });

  recordExposure(size);

  return {
    strategy: 'correlation',
    marketId: market.id,
    question: market.question,
    edge: bestGap,
    sizeUSDC: size,
    details: `yes=${market.yesPrice.toFixed(4)} related=${bestRelated.yesPrice.toFixed(4)}`,
  };
}
