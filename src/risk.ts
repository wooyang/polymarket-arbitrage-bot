import { CONFIG } from './config.js';
import type { MarketData } from './types.js';

let currentExposureUSDC = 0;
let dailyLossUSDC = 0;
let consecutiveLosses = 0;

export function resetRiskState(): void {
  currentExposureUSDC = 0;
  dailyLossUSDC = 0;
  consecutiveLosses = 0;
}

export function canTakeExposure(sizeUSDC: number): boolean {
  if (CONFIG.mode === 'scan') return true;
  return currentExposureUSDC + sizeUSDC <= CONFIG.maxExposureUSDC;
}

export function recordExposure(sizeUSDC: number): void {
  if (CONFIG.mode === 'scan') return;
  currentExposureUSDC += sizeUSDC;
}

export function releaseExposure(sizeUSDC: number): void {
  currentExposureUSDC = Math.max(0, currentExposureUSDC - sizeUSDC);
}

export function recordLoss(amountUSDC: number): void {
  dailyLossUSDC += amountUSDC;
  consecutiveLosses += 1;
}

export function recordWin(): void {
  consecutiveLosses = 0;
}

export function isCooldownActive(): boolean {
  return consecutiveLosses >= 3;
}

export function calculatePositionSize(edge: number, liquidity: number): number {
  const cappedLiquidity = Math.min(liquidity * 0.05, CONFIG.maxExposureUSDC);

  if (CONFIG.betMode === 'flat') {
    return Math.min(CONFIG.flatBetSizeUSDC, cappedLiquidity);
  }

  // Kelly fraction scaled by edge, capped by liquidity and max exposure
  const kellySize = CONFIG.maxExposureUSDC * CONFIG.kellyFraction * edge;
  return Math.max(5, Math.min(kellySize, cappedLiquidity));
}

export function getImpliedProbability(market: MarketData): number {
  return market.yesPrice;
}

export function determineSide(
  market: MarketData,
  externalPrice: number,
): 'BUY' | 'SELL' {
  const implied = getImpliedProbability(market);
  return externalPrice > implied ? 'BUY' : 'SELL';
}
