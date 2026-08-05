import {
  compareDecimalStrings,
  detectChainlinkSymbol,
  detectChainlinkTwapWindow,
  getChainlinkTwapQuote,
  isChainlinkTwapFresh,
  isCryptoUpDownMarket,
  twapToImpliedUpProbability,
  type ChainlinkTwapWindow,
} from './chainlinkTwap.js';
import { CONFIG } from './config.js';
import { log } from './logger.js';

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';

const CRYPTO_SLUGS: Record<string, string> = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
};

let spotCache: Map<string, { price: number; fetchedAt: number }> = new Map();
const SPOT_CACHE_TTL_MS = 15_000;

function detectCoinGeckoId(market: { slug: string; question: string; tags: string[] }): string | null {
  const haystack = `${market.slug} ${market.question} ${market.tags.join(' ')}`.toLowerCase();
  for (const [keyword, coinId] of Object.entries(CRYPTO_SLUGS)) {
    if (haystack.includes(keyword)) return coinId;
  }
  return null;
}

async function fetchCoinGeckoSpot(coinId: string): Promise<number | null> {
  const cached = spotCache.get(coinId);
  if (cached && Date.now() - cached.fetchedAt < SPOT_CACHE_TTL_MS) {
    return cached.price;
  }

  try {
    const url = `${COINGECKO_URL}?ids=${coinId}&vs_currencies=usd`;
    const res = await fetch(url);
    if (!res.ok) return cached?.price ?? null;

    const data = (await res.json()) as Record<string, { usd?: number }>;
    const price = data[coinId]?.usd;
    if (typeof price === 'number') {
      spotCache.set(coinId, { price, fetchedAt: Date.now() });
      return price;
    }
  } catch {
    return cached?.price ?? null;
  }

  return cached?.price ?? null;
}

/** Parse price-to-beat from market metadata when exposed by Gamma. */
export function parsePriceToBeat(market: {
  question: string;
  description?: string;
  priceToBeat?: string;
}): string | null {
  if (market.priceToBeat && market.priceToBeat !== '0') {
    return market.priceToBeat;
  }

  const text = `${market.question} ${market.description ?? ''}`;
  const patterns = [
    /price to beat[:\s]+\$?([\d,]+(?:\.\d+)?)/i,
    /target price[:\s]+\$?([\d,]+(?:\.\d+)?)/i,
    /beat[:\s]+\$?([\d,]+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/,/g, '');
  }

  return null;
}

function spotToImpliedProb(spotPrice: number, coinId: string): number {
  const anchors: Record<string, number> = {
    bitcoin: 100_000,
    ethereum: 3_500,
    solana: 150,
  };
  const anchor = anchors[coinId] ?? spotPrice;
  const ratio = spotPrice / anchor;
  return Math.max(0.05, Math.min(0.95, 0.5 + (ratio - 1) * 0.5));
}

export interface ExternalPriceResult {
  impliedProbability: number;
  source: 'chainlink-twap' | 'coingecko-spot';
  details: string;
}

/**
 * Latency reference price for crypto markets.
 * Prefers Polymarket RTDS Chainlink TWAP (Aug 2026 settlement) when available.
 */
export async function getExternalPrice(market: {
  slug: string;
  question: string;
  tags: string[];
  description?: string;
  priceToBeat?: string;
}): Promise<ExternalPriceResult | null> {
  const symbol = detectChainlinkSymbol(market);
  if (!symbol) return null;

  if (CONFIG.chainlinkTwapEnabled && isCryptoUpDownMarket(market)) {
    const windowSeconds: ChainlinkTwapWindow = detectChainlinkTwapWindow(market);
    const quote = getChainlinkTwapQuote(symbol, windowSeconds);

    if (quote && isChainlinkTwapFresh(quote)) {
      const priceToBeat = parsePriceToBeat(market);

      if (priceToBeat) {
        const implied = twapToImpliedUpProbability(quote.value, priceToBeat);
        const cmp = compareDecimalStrings(quote.value, priceToBeat);
        const direction = cmp > 0 ? 'above' : cmp < 0 ? 'below' : 'at';
        return {
          impliedProbability: implied,
          source: 'chainlink-twap',
          details: `twap=${quote.value} beat=${priceToBeat} (${direction}, ${windowSeconds}s window)`,
        };
      }

      log(
        `Chainlink TWAP available for ${symbol} but price-to-beat missing on "${market.question.slice(0, 40)}..."`,
        'warn',
      );
    }
  }

  const coinId = detectCoinGeckoId(market);
  if (!coinId) return null;

  const spot = await fetchCoinGeckoSpot(coinId);
  if (spot === null) return null;

  return {
    impliedProbability: spotToImpliedProb(spot, coinId),
    source: 'coingecko-spot',
    details: `spot=${spot.toFixed(2)} (fallback)`,
  };
}

export function findRelatedMarkets(
  market: { slug: string; tags: string[] },
  all: Array<{ slug: string; tags: string[]; yesPrice: number }>,
): Array<{ slug: string; yesPrice: number }> {
  const eventSlug = market.tags.find((t) => t !== market.slug);
  if (!eventSlug) return [];

  return all.filter((other) => {
    if (other.slug === market.slug) return false;
    return other.tags.includes(eventSlug);
  });
}

/** Warm spot cache for non-up/down crypto markets. */
export async function warmExternalPriceCache(
  markets: Array<{ slug: string; question: string; tags: string[] }>,
): Promise<void> {
  const coinIds = new Set<string>();
  for (const market of markets.slice(0, 20)) {
    const id = detectCoinGeckoId(market);
    if (id) coinIds.add(id);
  }
  await Promise.all([...coinIds].map((id) => fetchCoinGeckoSpot(id)));
}
