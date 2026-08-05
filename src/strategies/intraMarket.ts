import { CONFIG } from '../config.js';
import { logSignal } from '../logger.js';
import { calculatePositionSize, canTakeExposure, recordExposure } from '../risk.js';
import type { Trader } from '../trader.js';
import type { ArbitrageSignal, MarketData } from '../types.js';

export async function checkIntraMarket(
  market: MarketData,
  trader: Trader,
): Promise<ArbitrageSignal | null> {
  const { yesPrice, noPrice } = market;
  const sum = yesPrice + noPrice;
  const edge = 1.0 - sum;

  if (edge < CONFIG.minEdge) return null;

  const size = calculatePositionSize(edge, market.liquidity);
  if (!canTakeExposure(size)) return null;

  logSignal('intra-market', `${(edge * 100).toFixed(2)}% edge on "${market.question.slice(0, 50)}..."`);
  await trader.executeArbitrage(market, size, yesPrice, noPrice);
  recordExposure(size);

  return {
    strategy: 'intra-market',
    marketId: market.id,
    question: market.question,
    edge,
    sizeUSDC: size,
    details: `YES=${yesPrice.toFixed(4)} NO=${noPrice.toFixed(4)} sum=${sum.toFixed(4)}`,
  };
}
