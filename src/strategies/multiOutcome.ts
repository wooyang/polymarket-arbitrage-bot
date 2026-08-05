import { CONFIG } from '../config.js';
import { logSignal } from '../logger.js';
import { calculatePositionSize, canTakeExposure, recordExposure } from '../risk.js';
import type { Trader } from '../trader.js';
import type { ArbitrageSignal, MarketData } from '../types.js';

export async function checkMultiOutcome(
  market: MarketData,
  trader: Trader,
): Promise<ArbitrageSignal | null> {
  if (market.outcomes.length <= 2) return null;

  const sum = market.outcomes.reduce((acc, o) => acc + o.price, 0);
  const edge = 1.0 - sum;

  if (edge < CONFIG.minEdge) return null;

  const size = calculatePositionSize(edge, market.liquidity);
  if (!canTakeExposure(size)) return null;

  logSignal(
    'multi-outcome',
    `${(edge * 100).toFixed(2)}% bundle edge (${market.outcomes.length} outcomes) on "${market.question.slice(0, 50)}..."`,
  );

  const perLeg = size / market.outcomes.length;
  for (const outcome of market.outcomes) {
    const shares = Math.max(5, perLeg / Math.max(outcome.price, 0.01));
    await trader.placeOrder({
      market,
      tokenId: outcome.tokenId,
      side: 'BUY',
      price: outcome.price,
      size: shares,
      reason: `multi-outcome ${outcome.name}`,
    });
  }

  recordExposure(size);

  return {
    strategy: 'multi-outcome',
    marketId: market.id,
    question: market.question,
    edge,
    sizeUSDC: size,
    details: `${market.outcomes.length} outcomes sum=${sum.toFixed(4)}`,
  };
}
