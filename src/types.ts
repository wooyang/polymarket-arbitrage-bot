export type BotMode = 'live' | 'dry' | 'scan';
export type BetMode = 'kelly' | 'flat';
export type ExecutionMode = 'immediate' | 'sliced';
export type StrategyName =
  | 'intra-market'
  | 'multi-outcome'
  | 'latency'
  | 'correlation'
  | 'tail-end';

export interface BotConfig {
  minEdge: number;
  minLatencyEdge: number;
  maxExposureUSDC: number;
  pollIntervalMs: number;
  betMode: BetMode;
  flatBetSizeUSDC: number;
  kellyFraction: number;
  executionMode: ExecutionMode;
  sliceCount: number;
  sliceDurationMs: number;
  sliceMinSize: number;
  chainlinkTwapEnabled: boolean;
  chainlinkTwapMaxAgeMs: number;
  chainlinkTwapSymbols: string[];
  rtdsUrl: string;
  rtdsPingIntervalMs: number;
  strategies: StrategyName[];
  tailEndMinPrice: number;
  tailEndMaxHours: number;
  marketFetchLimit: number;
  clobHost: string;
  gammaHost: string;
  wsUrl: string;
  chainId: number;
  mode: BotMode;
}

export interface MarketOutcome {
  name: string;
  price: number;
  tokenId: string;
}

export interface MarketData {
  id: string;
  conditionId: string;
  question: string;
  slug: string;
  description?: string;
  yesPrice: number;
  noPrice: number;
  yesTokenId: string;
  noTokenId: string;
  outcomes: MarketOutcome[];
  liquidity: number;
  timeToResolution: number;
  endDate: Date;
  highestPrice: number;
  highestOutcome: string;
  tickSize: number;
  negRisk: boolean;
  tags: string[];
  priceToBeat?: string;
}

export interface ArbitrageSignal {
  strategy: StrategyName;
  marketId: string;
  question: string;
  edge: number;
  sizeUSDC: number;
  details: string;
}

export interface TradeRequest {
  market: MarketData;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  reason: string;
}

export interface SlicePlan {
  sizes: number[];
  intervalMs: number;
  totalSize: number;
}
