import { CONFIG } from '../config.js';
import { logSignal } from '../logger.js';
import { calculatePositionSize, canTakeExposure, recordExposure } from '../risk.js';
import type { Trader } from '../trader.js';
import type { ArbitrageSignal, MarketData } from '../types.js';

export async function checkTailEnd(
  market: MarketData,
  trader: Trader,
): Promise<ArbitrageSignal | null> {
  const maxSeconds = CONFIG.tailEndMaxHours * 60 * 60;

  if (market.timeToResolution > maxSeconds) return null;
  if (market.highestPrice < CONFIG.tailEndMinPrice) return null;

  const edge = 1.0 - market.highestPrice;
  if (edge < 0.005) return null;

  const size = calculatePositionSize(edge, market.liquidity);
  if (!canTakeExposure(size)) return null;

  logSignal(
    'tail-end',
    `Near-certain ${market.highestOutcome} @ ${market.highestPrice.toFixed(4)} on "${market.question.slice(0, 50)}..."`,
  );

  await trader.buyCertainty(market, market.highestOutcome, size);
  recordExposure(size);

  return {
    strategy: 'tail-end',
    marketId: market.id,
    question: market.question,
    edge,
    sizeUSDC: size,
    details: `${market.highestOutcome}=${market.highestPrice.toFixed(4)} resolves in ${(market.timeToResolution / 3600).toFixed(1)}h`,
  };
}
