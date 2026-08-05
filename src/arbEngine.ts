import { CONFIG } from './config.js';

import { warmExternalPriceCache } from './externalPrice.js';

import { log, logSignal } from './logger.js';

import { fetchAllMarkets } from './market.js';

import { isCooldownActive } from './risk.js';

import { checkCorrelation } from './strategies/correlation.js';

import { checkIntraMarket } from './strategies/intraMarket.js';

import { checkLatency } from './strategies/latency.js';

import { checkMultiOutcome } from './strategies/multiOutcome.js';

import { checkTailEnd } from './strategies/tailEnd.js';

import type { Trader } from './trader.js';

import type { ArbitrageSignal, MarketData } from './types.js';



export async function runArbitrageScan(

  trader: Trader,

  markets?: MarketData[],

): Promise<ArbitrageSignal[]> {

  const allMarkets = markets ?? (await fetchAllMarkets());

  const signals: ArbitrageSignal[] = [];



  if (isCooldownActive()) {

    log('Risk cooldown active after consecutive losses — skipping scan', 'warn');

    return signals;

  }



  log(`Scanning ${allMarkets.length} markets with strategies: ${CONFIG.strategies.join(', ')}`);



  for (const market of allMarkets) {

    try {

      if (CONFIG.strategies.includes('intra-market')) {

        const signal = await checkIntraMarket(market, trader);

        if (signal) signals.push(signal);

      }



      if (CONFIG.strategies.includes('multi-outcome')) {

        const signal = await checkMultiOutcome(market, trader);

        if (signal) signals.push(signal);

      }



      if (CONFIG.strategies.includes('latency')) {

        const signal = await checkLatency(market, trader);

        if (signal) signals.push(signal);

      }



      if (CONFIG.strategies.includes('correlation')) {

        const signal = await checkCorrelation(market, allMarkets, trader);

        if (signal) signals.push(signal);

      }



      if (CONFIG.strategies.includes('tail-end')) {

        const signal = await checkTailEnd(market, trader);

        if (signal) signals.push(signal);

      }

    } catch (err) {

      const message = err instanceof Error ? err.message : String(err);

      log(`Strategy error on market ${market.id}: ${message}`, 'error');

    }

  }



  if (signals.length > 0) {

    logSignal('engine', `Found ${signals.length} opportunity/opportunities this scan`);

  }



  return signals;

}



export { warmExternalPriceCache };


