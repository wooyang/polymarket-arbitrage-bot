import 'dotenv/config';
import type { BotConfig, BotMode, ExecutionMode, StrategyName } from './types.js';

function parseMode(value: string | undefined, fallback: BotMode): BotMode {
  if (value === 'live' || value === 'dry' || value === 'scan') return value;
  return fallback;
}

function parseStrategies(value: string | undefined): StrategyName[] {
  const defaults: StrategyName[] = [
    'intra-market',
    'multi-outcome',
    'latency',
    'correlation',
    'tail-end',
  ];
  if (!value) return defaults;

  const allowed = new Set<StrategyName>([
    'intra-market',
    'multi-outcome',
    'latency',
    'correlation',
    'tail-end',
  ]);

  const parsed = value
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is StrategyName => allowed.has(s as StrategyName));

  return parsed.length > 0 ? parsed : defaults;
}

function parseArgMode(): BotMode | undefined {
  const arg = process.argv.find((a) => a.startsWith('--mode='));
  if (!arg) return undefined;
  const mode = arg.split('=')[1];
  if (mode === 'live' || mode === 'dry' || mode === 'scan') return mode;
  return undefined;
}

function parseArgExecutionMode(): ExecutionMode | undefined {
  const arg = process.argv.find((a) => a.startsWith('--execution='));
  if (!arg) return undefined;
  const mode = arg.split('=')[1];
  if (mode === 'sliced' || mode === 'immediate') return mode;
  // backwards compat for old flag
  if (mode === 'twap') return 'sliced';
  return undefined;
}

function parseExecutionMode(value: string | undefined): ExecutionMode {
  if (value === 'sliced' || value === 'twap') return 'sliced';
  return 'immediate';
}

function parseSymbols(value: string | undefined): string[] {
  if (!value) return ['btc/usd', 'eth/usd', 'sol/usd'];
  return value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export const CONFIG: BotConfig = {
  minEdge: Number(process.env.MIN_EDGE ?? 0.02),
  minLatencyEdge: Number(process.env.MIN_LATENCY_EDGE ?? 0.015),
  maxExposureUSDC: Number(process.env.MAX_EXPOSURE_USDC ?? 500),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 500),
  betMode: process.env.BET_MODE === 'flat' ? 'flat' : 'kelly',
  flatBetSizeUSDC: Number(process.env.FLAT_BET_SIZE_USDC ?? 25),
  kellyFraction: Number(process.env.KELLY_FRACTION ?? 0.25),
  executionMode: parseArgExecutionMode() ?? parseExecutionMode(process.env.EXECUTION_MODE),
  sliceCount: Number(process.env.SLICE_COUNT ?? process.env.TWAP_SLICES ?? 5),
  sliceDurationMs: Number(process.env.SLICE_DURATION_MS ?? process.env.TWAP_DURATION_MS ?? 60_000),
  sliceMinSize: Number(process.env.SLICE_MIN_SIZE ?? process.env.TWAP_MIN_SLICE_SIZE ?? 5),
  chainlinkTwapEnabled: process.env.CHAINLINK_TWAP_ENABLED !== 'false',
  chainlinkTwapMaxAgeMs: Number(process.env.CHAINLINK_TWAP_MAX_AGE_MS ?? 30_000),
  chainlinkTwapSymbols: parseSymbols(process.env.CHAINLINK_TWAP_SYMBOLS),
  rtdsUrl: process.env.RTDS_URL ?? 'wss://ws-live-data.polymarket.com',
  rtdsPingIntervalMs: Number(process.env.RTDS_PING_INTERVAL_MS ?? 5_000),
  strategies: parseStrategies(process.env.STRATEGIES),
  tailEndMinPrice: Number(process.env.TAIL_END_MIN_PRICE ?? 0.96),
  tailEndMaxHours: Number(process.env.TAIL_END_MAX_HOURS ?? 24),
  marketFetchLimit: Number(process.env.MARKET_FETCH_LIMIT ?? 100),
  clobHost: process.env.CLOB_HOST ?? 'https://clob.polymarket.com',
  gammaHost: process.env.GAMMA_HOST ?? 'https://gamma-api.polymarket.com',
  wsUrl:
    process.env.WS_URL ?? 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
  chainId: Number(process.env.CHAIN_ID ?? 137),
  mode: parseArgMode() ?? parseMode(process.env.BOT_MODE, 'dry'),
};

export const ENV = {
  privateKey: process.env.PRIVATE_KEY ?? '',
  apiKey: process.env.POLYMARKET_API_KEY ?? '',
  apiSecret: process.env.POLYMARKET_API_SECRET ?? '',
  apiPassphrase: process.env.POLYMARKET_API_PASSPHRASE ?? '',
};
