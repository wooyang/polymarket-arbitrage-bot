import { CONFIG } from '../config.js';
import { getExternalPrice } from '../externalPrice.js';
import { logSignal } from '../logger.js';
import {
  calculatePositionSize,
  canTakeExposure,
  determineSide,
  getImpliedProbability,
  recordExposure,
} from '../risk.js';
import type { Trader } from '../trader.js';
import type { ArbitrageSignal, MarketData } from '../types.js';

export async function checkLatency(
  market: MarketData,
  trader: Trader,
): Promise<ArbitrageSignal | null> {
  const external = await getExternalPrice(market);
  if (external === null) return null;

  const impliedProb = getImpliedProbability(market);
  const diff = Math.abs(impliedProb - external.impliedProbability);

  if (diff <= CONFIG.minLatencyEdge) return null;

  const size = calculatePositionSize(diff, market.liquidity);
  if (!canTakeExposure(size)) return null;

  const side = determineSide(market, external.impliedProbability);
  const tokenId = side === 'BUY' ? market.yesTokenId : market.noTokenId;
  const price = side === 'BUY' ? market.yesPrice : market.noPrice;
  const shares = Math.max(5, size / Math.max(price, 0.01));

  logSignal(
    'latency',
    `${(diff * 100).toFixed(2)}% lag on "${market.question.slice(0, 50)}..." (${side}, ${external.source})`,
  );

  await trader.placeOrder({
    market,
    tokenId,
    side,
    price,
    size: shares,
    reason: `latency arb [${external.source}]`,
  });

  recordExposure(size);

  return {
    strategy: 'latency',
    marketId: market.id,
    question: market.question,
    edge: diff,
    sizeUSDC: size,
    details: `implied=${impliedProb.toFixed(4)} ref=${external.impliedProbability.toFixed(4)} ${external.details}`,
  };
}
