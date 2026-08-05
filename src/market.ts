import WebSocket from 'ws';
import { CONFIG } from './config.js';
import { log } from './logger.js';
import type { MarketData, MarketOutcome } from './types.js';

interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  description?: string;
  outcomes: string;
  outcomePrices: string;
  clobTokenIds: string;
  liquidityNum?: number;
  liquidity?: string;
  endDate?: string;
  orderPriceMinTickSize?: number;
  negRisk?: boolean;
  bestBid?: number;
  bestAsk?: number;
  groupItemThreshold?: string;
  line?: string;
  events?: Array<{ slug?: string; ticker?: string }>;
}

function parseJsonArray<T>(value: string | undefined, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T[];
  } catch {
    return fallback;
  }
}

function toMarketData(raw: GammaMarket): MarketData | null {
  const outcomeNames = parseJsonArray<string>(raw.outcomes, []);
  const outcomePrices = parseJsonArray<string>(raw.outcomePrices, []).map(Number);
  const tokenIds = parseJsonArray<string>(raw.clobTokenIds, []);

  if (outcomeNames.length < 2 || outcomePrices.length < 2 || tokenIds.length < 2) {
    return null;
  }

  const outcomes: MarketOutcome[] = outcomeNames.map((name, i) => ({
    name,
    price: outcomePrices[i] ?? 0,
    tokenId: tokenIds[i] ?? '',
  }));

  const yesIdx = outcomeNames.findIndex((n) => n.toLowerCase() === 'yes');
  const noIdx = outcomeNames.findIndex((n) => n.toLowerCase() === 'no');
  const yesOutcome = yesIdx >= 0 ? outcomes[yesIdx] : outcomes[0];
  const noOutcome = noIdx >= 0 ? outcomes[noIdx] : outcomes[1];

  const endDate = raw.endDate ? new Date(raw.endDate) : new Date(Date.now() + 86400000);
  const timeToResolution = Math.max(0, Math.floor((endDate.getTime() - Date.now()) / 1000));

  const highest = outcomes.reduce(
    (best, o) => (o.price > best.price ? o : best),
    outcomes[0],
  );

  const tags = (raw.events ?? [])
    .flatMap((e) => [e.slug, e.ticker])
    .filter((t): t is string => Boolean(t));

  return {
    id: raw.id,
    conditionId: raw.conditionId,
    question: raw.question,
    slug: raw.slug,
    description: raw.description,
    yesPrice: yesOutcome.price,
    noPrice: noOutcome.price,
    yesTokenId: yesOutcome.tokenId,
    noTokenId: noOutcome.tokenId,
    outcomes,
    liquidity: raw.liquidityNum ?? Number(raw.liquidity ?? 0),
    timeToResolution,
    endDate,
    highestPrice: highest.price,
    highestOutcome: highest.name,
    tickSize: raw.orderPriceMinTickSize ?? 0.001,
    negRisk: raw.negRisk ?? false,
    tags: [...tags, raw.slug],
    priceToBeat: raw.line ?? raw.groupItemThreshold,
  };
}

export async function fetchAllMarkets(limit = CONFIG.marketFetchLimit): Promise<MarketData[]> {
  const url = new URL(`${CONFIG.gammaHost}/markets`);
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('order', 'liquidityNum');
  url.searchParams.set('ascending', 'false');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gamma API error: ${response.status} ${response.statusText}`);
  }

  const rawMarkets = (await response.json()) as GammaMarket[];
  return rawMarkets
    .map(toMarketData)
    .filter((m): m is MarketData => m !== null);
}

export function updateMarketPrices(
  market: MarketData,
  tokenId: string,
  price: number,
): MarketData {
  const outcomes = market.outcomes.map((o) =>
    o.tokenId === tokenId ? { ...o, price } : o,
  );

  const yes = outcomes.find((o) => o.name.toLowerCase() === 'yes') ?? outcomes[0];
  const no = outcomes.find((o) => o.name.toLowerCase() === 'no') ?? outcomes[1];
  const highest = outcomes.reduce(
    (best, o) => (o.price > best.price ? o : best),
    outcomes[0],
  );

  return {
    ...market,
    outcomes,
    yesPrice: yes.price,
    noPrice: no.price,
    highestPrice: highest.price,
    highestOutcome: highest.name,
  };
}

type PriceHandler = (marketId: string, tokenId: string, price: number) => void;

export class MarketWebSocket {
  private ws: WebSocket | null = null;
  private tokenToMarket = new Map<string, string>();
  private pingTimer: NodeJS.Timeout | null = null;

  constructor(
    private markets: MarketData[],
    private onPrice: PriceHandler,
  ) {
    for (const market of markets) {
      for (const outcome of market.outcomes) {
        if (outcome.tokenId) {
          this.tokenToMarket.set(outcome.tokenId, market.id);
        }
      }
    }
  }

  connect(): void {
    const assetIds = [...this.tokenToMarket.keys()].slice(0, 200);
    if (assetIds.length === 0) return;

    this.ws = new WebSocket(CONFIG.wsUrl);

    this.ws.on('open', () => {
      log(`WebSocket connected, subscribing to ${assetIds.length} tokens`);
      this.ws?.send(
        JSON.stringify({
          assets_ids: assetIds,
          type: 'market',
          custom_feature_enabled: true,
        }),
      );

      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send('PING');
        }
      }, 10_000);
    });

    this.ws.on('message', (data) => {
      const text = data.toString();
      if (text === 'PONG') return;

      try {
        const msg = JSON.parse(text) as Record<string, unknown>;
        this.handleMessage(msg);
      } catch {
        // ignore non-json frames
      }
    });

    this.ws.on('close', () => {
      log('WebSocket closed, reconnecting in 5s', 'warn');
      if (this.pingTimer) clearInterval(this.pingTimer);
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (err) => {
      log(`WebSocket error: ${err.message}`, 'error');
    });
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const eventType = msg.event_type as string | undefined;

    if (eventType === 'book') {
      const tokenId = msg.asset_id as string;
      const asks = msg.asks as Array<{ price: string }> | undefined;
      const bestAsk = asks?.[0]?.price;
      if (tokenId && bestAsk) {
        this.emitPrice(tokenId, Number(bestAsk));
      }
      return;
    }

    if (eventType === 'price_change') {
      const changes = msg.price_changes as Array<{
        asset_id: string;
        best_ask?: string;
        price?: string;
      }> | undefined;

      for (const change of changes ?? []) {
        const price = change.best_ask ?? change.price;
        if (change.asset_id && price) {
          this.emitPrice(change.asset_id, Number(price));
        }
      }
      return;
    }

    if (eventType === 'last_trade_price') {
      const tokenId = msg.asset_id as string;
      const price = msg.price as string | undefined;
      if (tokenId && price) {
        this.emitPrice(tokenId, Number(price));
      }
    }
  }

  private emitPrice(tokenId: string, price: number): void {
    const marketId = this.tokenToMarket.get(tokenId);
    if (marketId && Number.isFinite(price)) {
      this.onPrice(marketId, tokenId, price);
    }
  }

  close(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }
}

export function getMarketById(markets: MarketData[], id: string): MarketData | undefined {
  return markets.find((m) => m.id === id);
}
