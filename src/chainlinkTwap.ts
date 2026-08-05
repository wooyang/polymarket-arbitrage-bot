import WebSocket from 'ws';
import { CONFIG } from './config.js';
import { log } from './logger.js';

/** Polymarket RTDS Chainlink TWAP lookback windows (Aug 2026 settlement update). */
export type ChainlinkTwapWindow = 30 | 60;

export interface ChainlinkTwapQuote {
  symbol: string;
  value: string;
  fullAccuracyValue?: string;
  windowSeconds: ChainlinkTwapWindow;
  observedAt: number;
}

const cache = new Map<string, ChainlinkTwapQuote>();

function cacheKey(symbol: string, windowSeconds: ChainlinkTwapWindow): string {
  return `${symbol}:${windowSeconds}`;
}

export function getChainlinkTwapQuote(
  symbol: string,
  windowSeconds: ChainlinkTwapWindow,
): ChainlinkTwapQuote | null {
  return cache.get(cacheKey(symbol, windowSeconds)) ?? null;
}

export function isChainlinkTwapFresh(
  quote: ChainlinkTwapQuote,
  maxAgeMs = CONFIG.chainlinkTwapMaxAgeMs,
): boolean {
  return Date.now() - quote.observedAt <= maxAgeMs;
}

/**
 * Polymarket crypto up/down settlement windows (effective Aug 7, 2026 UTC):
 * - 5-minute markets → 30s Chainlink TWAP
 * - 15-minute & 4-hour markets → 60s Chainlink TWAP
 */
export function detectChainlinkTwapWindow(market: {
  slug: string;
  question: string;
}): ChainlinkTwapWindow {
  const text = `${market.slug} ${market.question}`.toLowerCase();
  if (/\b5[\s-]?m(in(ute)?s?)?\b/.test(text)) return 30;
  return 60;
}

const SYMBOL_KEYWORDS: Record<string, string> = {
  btc: 'btc/usd',
  bitcoin: 'btc/usd',
  eth: 'eth/usd',
  ethereum: 'eth/usd',
  sol: 'sol/usd',
  solana: 'sol/usd',
  xrp: 'xrp/usd',
  doge: 'doge/usd',
  dogecoin: 'doge/usd',
};

export function detectChainlinkSymbol(market: {
  slug: string;
  question: string;
  tags: string[];
}): string | null {
  const haystack = `${market.slug} ${market.question} ${market.tags.join(' ')}`.toLowerCase();

  for (const [keyword, symbol] of Object.entries(SYMBOL_KEYWORDS)) {
    if (haystack.includes(keyword)) return symbol;
  }
  return null;
}

export function isCryptoUpDownMarket(market: {
  slug: string;
  question: string;
}): boolean {
  const text = `${market.slug} ${market.question}`.toLowerCase();
  return (
    (text.includes('up') || text.includes('down')) &&
    (text.includes('btc') ||
      text.includes('bitcoin') ||
      text.includes('eth') ||
      text.includes('ethereum') ||
      text.includes('sol') ||
      text.includes('crypto'))
  );
}

/** Compare decimal strings without float drift. Returns -1 | 0 | 1 */
export function compareDecimalStrings(a: string, b: string): number {
  const [ai, af = ''] = a.split('.');
  const [bi, bf = ''] = b.split('.');
  const maxFrac = Math.max(af.length, bf.length);
  const aPad = `${ai}${af.padEnd(maxFrac, '0')}`;
  const bPad = `${bi}${bf.padEnd(maxFrac, '0')}`;
  if (aPad === bPad) return 0;
  return aPad > bPad ? 1 : -1;
}

/**
 * Map Chainlink TWAP vs price-to-beat into an implied UP probability.
 * TWAP above beat → higher YES; below beat → lower YES.
 */
export function twapToImpliedUpProbability(
  twapValue: string,
  priceToBeat: string,
): number {
  const twap = Number(twapValue);
  const beat = Number(priceToBeat);
  if (!Number.isFinite(twap) || !Number.isFinite(beat) || beat <= 0) {
    return 0.5;
  }

  const deltaPct = (twap - beat) / beat;
  // Scale: 0.1% move in TWAP vs beat ≈ 5% probability shift
  return Math.max(0.05, Math.min(0.95, 0.5 + deltaPct * 50));
}

export class ChainlinkTwapFeed {
  private ws: WebSocket | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private subscribed = false;

  connect(): void {
    if (!CONFIG.chainlinkTwapEnabled) return;

    this.ws = new WebSocket(CONFIG.rtdsUrl);

    this.ws.on('open', () => {
      log('Chainlink TWAP RTDS connected');
      this.subscribe();
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send('PING');
        }
      }, CONFIG.rtdsPingIntervalMs);
    });

    this.ws.on('message', (data) => {
      const text = data.toString();
      if (text === 'PONG') return;
      try {
        this.handleMessage(JSON.parse(text) as Record<string, unknown>);
      } catch {
        // ignore non-json
      }
    });

    this.ws.on('close', () => {
      log('Chainlink TWAP RTDS disconnected, reconnecting in 5s', 'warn');
      this.cleanup();
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (err) => {
      log(`Chainlink TWAP RTDS error: ${err.message}`, 'error');
    });
  }

  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const symbols = CONFIG.chainlinkTwapSymbols;
    const subscriptions = [
      ...symbols.map((symbol) => ({
        topic: 'crypto_prices_twap_thirty',
        type: 'update',
        filters: JSON.stringify({ symbol }),
      })),
      ...symbols.map((symbol) => ({
        topic: 'crypto_prices_twap_sixty',
        type: 'update',
        filters: JSON.stringify({ symbol }),
      })),
    ];

    this.ws.send(JSON.stringify({ action: 'subscribe', subscriptions }));
    this.subscribed = true;
    log(`Subscribed to Chainlink TWAP RTDS for ${symbols.join(', ')}`);
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const topic = msg.topic as string | undefined;
    if (topic !== 'crypto_prices_twap_thirty' && topic !== 'crypto_prices_twap_sixty') {
      return;
    }

    const payload = msg.payload as Record<string, unknown> | undefined;
    if (!payload) return;

    const symbol = payload.symbol as string | undefined;
    const value =
      (payload.full_accuracy_value as string | undefined) ??
      String(payload.value ?? '');
    const windowSeconds = (payload.window_s as number | undefined) ??
      (topic === 'crypto_prices_twap_thirty' ? 30 : 60);
    const observedAt = (payload.timestamp as number | undefined) ?? Date.now();

    if (!symbol || !value) return;

    const quote: ChainlinkTwapQuote = {
      symbol,
      value: normalizeDisplayValue(payload.value, value),
      fullAccuracyValue: payload.full_accuracy_value as string | undefined,
      windowSeconds: windowSeconds as ChainlinkTwapWindow,
      observedAt,
    };

    cache.set(cacheKey(symbol, quote.windowSeconds), quote);
  }

  close(): void {
    this.cleanup();
    this.ws?.close();
  }

  private cleanup(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.subscribed = false;
  }
}

function normalizeDisplayValue(display: unknown, fallback: string): string {
  if (typeof display === 'string') return display;
  if (typeof display === 'number' && Number.isFinite(display)) return String(display);
  return fallback;
}

/** Singleton feed started by bot.ts */
let feed: ChainlinkTwapFeed | null = null;

export function startChainlinkTwapFeed(): ChainlinkTwapFeed | null {
  if (!CONFIG.chainlinkTwapEnabled) return null;
  if (!feed) {
    feed = new ChainlinkTwapFeed();
    feed.connect();
  }
  return feed;
}

export function stopChainlinkTwapFeed(): void {
  feed?.close();
  feed = null;
}
