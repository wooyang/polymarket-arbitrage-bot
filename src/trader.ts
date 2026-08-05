import { ApiKeyCreds, ClobClient, OrderType, Side } from '@polymarket/clob-client';
import type { TickSize } from '@polymarket/clob-client/dist/types.js';
import { Wallet } from 'ethers';
import { CONFIG, ENV } from './config.js';
import { log, sleep } from './logger.js';
import { buildSlicePlan, logSlicePlan } from './orderSlicing.js';
import type { BotMode, MarketData, TradeRequest } from './types.js';

const TICK_SIZES: TickSize[] = ['0.1', '0.01', '0.001', '0.0001'];

function toTickSize(value: number): TickSize {
  const match = TICK_SIZES.find((t) => Number(t) === value);
  return match ?? '0.001';
}

export class Trader {
  private client: ClobClient | null = null;
  private initialized = false;

  constructor(private mode: BotMode) {}

  async init(): Promise<void> {
    if (this.mode === 'scan') {
      this.initialized = true;
      return;
    }

    if (!ENV.privateKey || ENV.privateKey === 'your_0x_wallet_private_key') {
      throw new Error('PRIVATE_KEY is required for dry and live modes. Copy .env.example to .env');
    }

    const signer = new Wallet(ENV.privateKey);
    const tempClient = new ClobClient(CONFIG.clobHost, CONFIG.chainId, signer);

    let creds: ApiKeyCreds;
    if (ENV.apiKey && ENV.apiSecret && ENV.apiPassphrase) {
      creds = {
        key: ENV.apiKey,
        secret: ENV.apiSecret,
        passphrase: ENV.apiPassphrase,
      };
    } else {
      creds = await tempClient.createOrDeriveApiKey();
      log('Derived Polymarket API credentials from wallet');
    }

    this.client = new ClobClient(CONFIG.clobHost, CONFIG.chainId, signer, creds);
    this.initialized = true;
    log(`Trader initialized in ${this.mode} mode`);
  }

  isReady(): boolean {
    return this.initialized;
  }

  async placeOrder(req: TradeRequest): Promise<void> {
    if (CONFIG.executionMode === 'sliced' && req.size > CONFIG.sliceMinSize) {
      await this.placeOrderSliced(req);
      return;
    }
    await this.placeOrderImmediate(req);
  }

  async placeOrderSliced(req: TradeRequest): Promise<void> {
    const plan = buildSlicePlan(req.size);
    logSlicePlan(req.reason, plan);

    for (let i = 0; i < plan.sizes.length; i++) {
      const sliceNum = i + 1;
      await this.placeOrderImmediate({
        ...req,
        size: plan.sizes[i],
        reason: `${req.reason} [slice ${sliceNum}/${plan.sizes.length}]`,
      });

      if (i < plan.sizes.length - 1 && plan.intervalMs > 0) {
        await sleep(plan.intervalMs);
      }
    }
  }

  async placeOrderImmediate(req: TradeRequest): Promise<void> {
    const label = `${req.side} ${req.size.toFixed(2)} @ ${req.price.toFixed(4)} (${req.reason})`;

    if (this.mode === 'scan') {
      log(`[scan] Would ${label} on "${req.market.question.slice(0, 60)}..."`, 'signal');
      return;
    }

    if (this.mode === 'dry') {
      log(`[dry-run] Would ${label} on "${req.market.question.slice(0, 60)}..."`, 'signal');
      return;
    }

    if (!this.client) {
      throw new Error('CLOB client not initialized');
    }

    const side = req.side === 'BUY' ? Side.BUY : Side.SELL;
    const tickSize = toTickSize(req.market.tickSize);

    await this.client.createAndPostOrder(
      {
        tokenID: req.tokenId,
        price: req.price,
        size: req.size,
        side,
      },
      { tickSize, negRisk: req.market.negRisk },
      OrderType.GTC,
    );

    log(`Order placed: ${label}`);
  }

  async executeArbitrage(
    market: MarketData,
    sizeUSDC: number,
    yesPrice: number,
    noPrice: number,
  ): Promise<void> {
    const shares = Math.max(5, sizeUSDC / Math.max(yesPrice, noPrice, 0.01));

    if (CONFIG.executionMode === 'sliced' && shares > CONFIG.sliceMinSize) {
      await this.executeArbitrageSliced(market, shares, yesPrice, noPrice);
      return;
    }

    await Promise.all([
      this.placeOrderImmediate({
        market,
        tokenId: market.yesTokenId,
        side: 'BUY',
        price: yesPrice,
        size: shares,
        reason: 'intra-market YES leg',
      }),
      this.placeOrderImmediate({
        market,
        tokenId: market.noTokenId,
        side: 'BUY',
        price: noPrice,
        size: shares,
        reason: 'intra-market NO leg',
      }),
    ]);
  }

  async executeArbitrageSliced(
    market: MarketData,
    shares: number,
    yesPrice: number,
    noPrice: number,
  ): Promise<void> {
    const plan = buildSlicePlan(shares);
    logSlicePlan('intra-market arb (YES+NO)', plan);

    for (let i = 0; i < plan.sizes.length; i++) {
      const sliceNum = i + 1;
      const sliceSize = plan.sizes[i];
      const suffix = `[slice ${sliceNum}/${plan.sizes.length}]`;

      await Promise.all([
        this.placeOrderImmediate({
          market,
          tokenId: market.yesTokenId,
          side: 'BUY',
          price: yesPrice,
          size: sliceSize,
          reason: `intra-market YES leg ${suffix}`,
        }),
        this.placeOrderImmediate({
          market,
          tokenId: market.noTokenId,
          side: 'BUY',
          price: noPrice,
          size: sliceSize,
          reason: `intra-market NO leg ${suffix}`,
        }),
      ]);

      if (i < plan.sizes.length - 1 && plan.intervalMs > 0) {
        await sleep(plan.intervalMs);
      }
    }
  }

  async buyCertainty(market: MarketData, outcomeName: string, sizeUSDC: number): Promise<void> {
    const outcome = market.outcomes.find((o) => o.name === outcomeName);
    if (!outcome) return;

    const shares = Math.max(5, sizeUSDC / Math.max(outcome.price, 0.01));
    await this.placeOrder({
      market,
      tokenId: outcome.tokenId,
      side: 'BUY',
      price: outcome.price,
      size: shares,
      reason: `tail-end ${outcomeName}`,
    });
  }
}
