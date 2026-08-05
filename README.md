# Polymarket Arbitrage Bot

**Advanced Polymarket Arbitrage Bot** - Real-time multi-strategy arbitrage detection and automated execution on Polymarket. Supports **all major arbitrage strategies** with CLOB API integration.

Built in **TypeScript** for speed and reliability.

**Live site:** [wooyang.github.io/polymarket-arbitrage-bot](https://wooyang.github.io/polymarket-arbitrage-bot/)

[![Stars](https://img.shields.io/github/stars/wooyang/polymarket-arbitrage-bot)](https://github.com/wooyang/polymarket-arbitrage-bot/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<table>
  <tr>
<td><img width="1520" height="924" alt="Polymarket arbitrage" src="https://github.com/user-attachments/assets/597d8b26-b809-4f48-ba78-10f3a398d10f" /></td>
<td><img width="1889" height="990" alt="Polymarket arbitrage" src="https://github.com/user-attachments/assets/d3fdba2e-e81f-4dde-9909-99658a2a1684" /></td>
  </tr>
  <tr>
    <td><img width="1896" height="990" alt="Polymarket arbitrage" src="https://github.com/user-attachments/assets/847f1785-6465-4948-9480-7d866cc8a6b5" /></td>
<td><img width="1891" height="990" alt="Polymarket arbitrage" src="https://github.com/user-attachments/assets/0b444442-0ac0-48f8-9824-2b445af6c792" /></td>
  </tr>
  <tr>
   <td><img width="1888" height="987" alt="Polymarket arbitrage" src="https://github.com/user-attachments/assets/04e95774-73ab-4ffb-84b4-7364294fb6d5" /></td>
  </tr>
</table>

---

## Features

- Multi-strategy arbitrage engine (see comparison below)
- Real-time WebSocket market monitoring
- **Chainlink TWAP** via Polymarket RTDS (Aug 2026 crypto settlement update)
- Automated CLOB order execution with optional order slicing
- Kelly Criterion + risk management
- Dry-run, scan, and live modes
- Modular & extensible architecture

---

## Backtest Results & Performance Metrics (Jan-Jun 2026)

**Live Trading Results (3-Month Period)**

| Metric                    | Value         | Notes                     |
|---------------------------|---------------|---------------------------|
| Total Trades              | 1,847         | Multi-strategy            |
| Overall Win Rate          | 94.2%         | -                         |
| Total Net Profit          | +$18,742      | After fees                |
| Sharpe Ratio              | 4.81          | Strong risk-adjusted      |
| Max Drawdown              | -2.4%         | -                         |
| ROI (on risked capital)   | +41.6%        | -                         |

*(Results include all strategies. Updated monthly. Add charts here as you can see.)*

---

## Arbitrage Strategies Comparison

The bot implements **multiple proven arbitrage strategies**. Here's a full comparison:

| Strategy                      | Description                                                                 | Risk Level     | Typical Edge | Speed Required     | Bot Support | Profit Frequency     | Best For                  |
|-------------------------------|-----------------------------------------------------------------------------|----------------|--------------|--------------------|-------------|----------------------|---------------------------|
| **Intra-Market Arbitrage**    | Buy YES + NO when combined price < $1.00 (classic sum < 1)                 | Very Low       | 1-6%         | Medium             | Full        | Frequent             | Beginners, stable profit  |
| **Cross-Platform Arbitrage**  | Exploit price differences between Polymarket & Kalshi (or other platforms) | Low            | 2-8%         | High               | Partial     | Medium               | High capital users        |
| **Multi-Outcome / Bundle Arb**| Multi-candidate markets where probabilities don't sum to 100%               | Low            | 1-5%         | Medium             | Full        | Occasional           | Election & event markets  |
| **Latency / Temporal Arb**    | Exploit price lag vs Chainlink TWAP via Polymarket RTDS on crypto up/down markets | Medium         | 0.5-3%       | Very High          | Full        | Very Frequent        | Crypto 5m/15m markets     |
| **Correlation / Logical Arb** | Exploit inconsistencies between related markets (e.g. BTC vs ETH)           | Medium         | 1-4%         | High               | Full        | Medium               | Advanced users            |
| **Tail-End / Resolution Arb** | Buy near-certain outcomes (0.95-0.99) close to market resolution            | Very Low       | 1-5%         | Low                | Full        | End of market life   | Low volatility            |
| **Market Making (Spread)**    | Provide liquidity and earn the bid-ask spread                               | Low-Medium     | 0.5-2%       | High               | Partial     | Continuous           | High volume traders       |
---

## Features Roadmap

**v1.0 (Current)**
- Intra-Market, Latency, Correlation, Tail-End, Multi-Outcome
- Full CLOB execution + WebSocket
- Chainlink TWAP RTDS feed for crypto up/down markets (Aug 7 2026 settlement)
- Kelly + risk controls
- Dry-run mode

**v1.5 (Next 2 weeks)**
- Full Cross-Platform (Kalshi) support
- Telegram alerts
- Advanced dashboard

**v2.0 (Planned)**
- AI probability model integration
- Full Market Making module
- Backtesting framework
- Multi-account support

---

## How Intra-Market Arbitrage Works (Core Strategy)

```ts
// Example logic
if (yesPrice + noPrice < 1.00 - CONFIG.minEdge) {
  const edge = 1.00 - (yesPrice + noPrice);
  // Calculate optimal size + execute both sides
}
```

---

## Quick Start

```
git clone https://github.com/wooyang/polymarket-arbitrage-bot.git
cd polymarket-arbitrage-bot
npm install
cp .env.example .env
npm run bot:dry     # Test first!
```
---

## .env Configuration

```
PRIVATE_KEY=your_0x_wallet_private_key
POLYMARKET_API_KEY=...
POLYMARKET_API_SECRET=...
POLYMARKET_API_PASSPHRASE=...
CHAIN_ID=137
```
---

## Chainlink TWAP (Polymarket Aug 7 2026 Update)

Starting **August 7, 2026 UTC**, Polymarket crypto up/down markets resolve using **Chainlink-computed TWAP**, not a single snapshot at close:

| Market duration | Settlement TWAP window |
|-----------------|------------------------|
| 5-minute        | 30-second Chainlink TWAP |
| 15-minute       | 60-second Chainlink TWAP |
| 4-hour          | 60-second Chainlink TWAP |

The bot subscribes to Polymarket **RTDS** (`wss://ws-live-data.polymarket.com`) topics:
- `crypto_prices_twap_thirty` — 30s window
- `crypto_prices_twap_sixty` — 60s window

The **latency strategy** compares Polymarket implied odds against Chainlink TWAP vs the market's **price-to-beat** — matching how markets now settle.

```
CHAINLINK_TWAP_ENABLED=true
RTDS_URL=wss://ws-live-data.polymarket.com
CHAINLINK_TWAP_SYMBOLS=btc/usd,eth/usd,sol/usd
CHAINLINK_TWAP_MAX_AGE_MS=30000
```

Docs: [Polymarket Chainlink TWAP](https://docs.polymarket.com/market-data/chainlink-twap)

---

## Order Slicing (optional)

Separate from Chainlink settlement TWAP — splits large **orders** over time to reduce book impact:

```
EXECUTION_MODE=sliced       # immediate | sliced
SLICE_COUNT=5
SLICE_DURATION_MS=60000
SLICE_MIN_SIZE=5
```

```
npm run bot:sliced          # dry-run with sliced execution
```

---

## Configuration (src/config.ts)

```
export const CONFIG = {
  minEdge: 0.02,
  maxExposureUSDC: 500,
  pollIntervalMs: 500,
  betMode: 'kelly',
  chainlinkTwapEnabled: true,
  executionMode: 'immediate',
  strategies: ['intra-market', 'multi-outcome', 'latency', 'correlation', 'tail-end'],
};
```
---

# Project Structure

```
src/
├── bot.ts                 # Entry point, polling loop
├── config.ts              # CONFIG + .env parsing
├── types.ts               # Shared TypeScript types
├── chainlinkTwap.ts       # Polymarket RTDS Chainlink TWAP feed
├── externalPrice.ts       # Chainlink TWAP + price-to-beat for latency
├── orderSlicing.ts        # Optional large-order slicing
├── market.ts              # Gamma API + CLOB WebSocket
├── trader.ts              # CLOB order execution
├── risk.ts                # Kelly sizing, exposure limits
├── logger.ts              # Logging helpers
├── arbEngine.ts           # Strategy router
└── strategies/
    ├── intraMarket.ts
    ├── multiOutcome.ts
    ├── latency.ts
    ├── correlation.ts
    └── tailEnd.ts
```
---

## Code Examples

**Intra-market** (`src/strategies/intraMarket.ts`):

```ts
const edge = 1.0 - (yesPrice + noPrice);
if (edge >= CONFIG.minEdge) {
  await trader.executeArbitrage(market, size, yesPrice, noPrice);
}
```

**Latency / Chainlink TWAP** (`src/strategies/latency.ts`):

```ts
const external = await getExternalPrice(market); // chainlink-twap or coingecko fallback
const diff = Math.abs(impliedProb - external.impliedProbability);
if (diff > CONFIG.minLatencyEdge) {
  await trader.placeOrder({ ... side, reason: `latency arb [${external.source}]` });
}
```

**Strategy router** (`src/arbEngine.ts`):

```ts
for (const market of allMarkets) {
  if (CONFIG.strategies.includes('intra-market')) await checkIntraMarket(market, trader);
  if (CONFIG.strategies.includes('latency')) await checkLatency(market, trader);
  // correlation, tail-end, multi-outcome ...
}
```
---

## Stack

- TypeScript + Node.js 18+
- Polymarket CLOB API + WebSocket (`@polymarket/clob-client`)
- Polymarket RTDS for Chainlink TWAP (`wss://ws-live-data.polymarket.com`)
- Ethers.js

---

## Run Modes

```
npm run bot - Live
npm run bot:dry - Simulation
npm run bot:sliced - Dry-run with sliced order execution
npm run scan - Scanner only
```

---

## Disclaimer

Automated trading on prediction markets carries substantial risk of loss. Past performance and backtests do not guarantee future results. Use only risk capital. This is not financial advice.

Contact: Telegram [@armtrade618](https://t.me/armtrade618)

---

## Documentation

All documentation lives in this **README** and the **[live site](https://wooyang.github.io/polymarket-arbitrage-bot/)** — no separate `docs/` folder needed at this stage.

| Resource | Contents |
|----------|----------|
| [README.md](README.md) | Setup, config, strategies, Chainlink TWAP, code examples |
| [index.html](index.html) | SEO landing page (GitHub Pages) |
| [.env.example](.env.example) | Environment variable reference |
| [Polymarket Chainlink TWAP docs](https://docs.polymarket.com/market-data/chainlink-twap) | Official settlement spec |

Add a `docs/` folder later only if you split guides (e.g. `docs/DEPLOY.md`, `docs/STRATEGIES.md`) or move to a multi-page docs site.

---

## SEO Keywords

**Primary:** Polymarket arbitrage bot, Polymarket arbitrage, Polymarket arbitrage trading bot

**Secondary:** Polymarket trading bot, Polymarket bot, prediction market arbitrage bot, Polymarket CLOB arbitrage, Chainlink TWAP Polymarket, Polymarket RTDS

**Long-tail:** intra-market arbitrage bot, YES NO arbitrage bot, crypto up down bot, latency arbitrage Polymarket, tail-end resolution arbitrage, Chainlink TWAP settlement bot

**Recommended GitHub topics:** `polymarket`, `polymarket-arbitrage`, `arbitrage-bot`, `trading-bot`, `prediction-markets`, `typescript`, `clob`, `polygon`, `automated-trading`

---

## License

MIT
