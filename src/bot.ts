import { runArbitrageScan, warmExternalPriceCache } from './arbEngine.js';

import {

  startChainlinkTwapFeed,

  stopChainlinkTwapFeed,

} from './chainlinkTwap.js';

import { CONFIG } from './config.js';

import { log, sleep } from './logger.js';

import {

  fetchAllMarkets,

  getMarketById,

  MarketWebSocket,

  updateMarketPrices,

} from './market.js';

import type { MarketData } from './types.js';

import { Trader } from './trader.js';



async function main(): Promise<void> {

  log(`Starting polymarket-arbitrage-bot in ${CONFIG.mode} mode`);

  log(`Strategies: ${CONFIG.strategies.join(', ')}`);

  log(

    `Execution: ${CONFIG.executionMode}${CONFIG.executionMode === 'sliced' ? ` (${CONFIG.sliceCount} slices / ${CONFIG.sliceDurationMs / 1000}s)` : ''}`,

  );

  if (CONFIG.chainlinkTwapEnabled) {

    log(`Chainlink TWAP RTDS: ${CONFIG.rtdsUrl} | symbols: ${CONFIG.chainlinkTwapSymbols.join(', ')}`);

  }

  log(`Min edge: ${(CONFIG.minEdge * 100).toFixed(1)}% | Max exposure: $${CONFIG.maxExposureUSDC}`);



  if (CONFIG.chainlinkTwapEnabled) {

    startChainlinkTwapFeed();

  }



  const trader = new Trader(CONFIG.mode);

  await trader.init();



  let markets = await fetchAllMarkets();

  log(`Loaded ${markets.length} active markets`);



  await warmExternalPriceCache(markets);



  if (CONFIG.mode !== 'scan') {

    const ws = new MarketWebSocket(markets, (marketId, tokenId, price) => {

      const market = getMarketById(markets, marketId);

      if (market) {

        markets = markets.map((m) =>

          m.id === marketId ? updateMarketPrices(m, tokenId, price) : m,

        );

      }

    });

    ws.connect();



    process.on('SIGINT', () => {

      log('Shutting down...');

      ws.close();

      stopChainlinkTwapFeed();

      process.exit(0);

    });

  }



  // eslint-disable-next-line no-constant-condition

  while (true) {

    const start = Date.now();

    const signals = await runArbitrageScan(trader, markets);



    if (CONFIG.mode === 'scan' && signals.length === 0) {

      log('No opportunities found this scan');

    }



    const elapsed = Date.now() - start;

    const wait = Math.max(0, CONFIG.pollIntervalMs - elapsed);

    await sleep(wait);

  }

}



main().catch((err) => {

  const message = err instanceof Error ? err.message : String(err);

  log(`Fatal error: ${message}`, 'error');

  process.exit(1);

});


