# Trading Terminal Migration — Index

Part of the Trading Terminal Migration set — this is the index.

This doc set is a **complete, copy-paste-friendly specification for migrating the TradeFightClub trading terminal** — chart, orderbook, order entry, positions, market data, account, Pacifica exchange integration, and the design system — **into a fresh project**. It deliberately **excludes the duels/fights/arena game layer**. Wherever fight/duel logic is interwoven with terminal code, the relevant doc flags the exact file/line so you know precisely what to strip.

## How a fresh Claude should use this set

1. **Read [01 – Overview & Architecture](./01-overview-architecture.md) first** to build a mental map of the stack, data flow, and the full file inventory.
2. Use **[20 – Migration Checklist & Gaps](./20-migration-checklist-gaps.md) as your task tracker** while you work — it lists every file to migrate, every fight entanglement to remove, every gap the repo does not contain, the target folder layout, and a definition-of-done smoke test.
3. Migrate **bottom-up**: design tokens → UI primitives → data hooks → panels → page → server/API → exchange integration. The reading order below follows that dependency order.
4. Treat the inline `fightEntanglements` callouts as hard removal targets — the terminal must build and run with zero imports from the arena layer.

> ⚠️ **Start here:** Read **[01 – Overview & Architecture](./01-overview-architecture.md)** to understand the system, then keep **[20 – Migration Checklist & Gaps](./20-migration-checklist-gaps.md)** open as your running checklist and gap list.

> 🏛️ **Where does the terminal live in UpDown?** See **[ADR-001 – Terminal Architecture](./ADR-001-terminal-architecture.md)** — the decision to build it as `apps/terminal` inside the UpDown monorepo with `packages/exchange-*` adapters (HyperLiquid first), rather than a route in `apps/web` or a separate repo.

## Reading order (recommended)

`01` → `02` → `03` → `10` → `04` → `05` → `06` → `07` → `08` → `09` → `11` → `12` → `13` → `14` → `15` → `16` → `17` → `18` → `19` → `20`

(Foundations first: architecture, then design tokens/Tailwind, then primitives; then the UI panels; then charts; then hooks and realtime; then the Pacifica/server/API backend; then deps/env; finish on the checklist.)

## Documents in this set

| # | Doc | Description |
| --- | --- | --- |
| 00 | [README.md](./README.md) | This index. |
| ADR | [ADR-001-terminal-architecture.md](./ADR-001-terminal-architecture.md) | Architecture decision: build the terminal as `apps/terminal` in the UpDown monorepo + `packages/exchange-*` adapters (3-faced adapter: read / signer / stream). Compares build-in-web vs separate-repo vs monorepo+packages; folder layout, migration path, risks. |
| 01 | [01-overview-architecture.md](./01-overview-architecture.md) | Overview & Architecture — entry map: tech stack, data flow, full file inventory cross-linked to siblings. |
| 02 | [02-design-tokens-css.md](./02-design-tokens-css.md) | Design Tokens & Global CSS — every CSS custom property, full color palette (hex), keyframes/animations, component & utility classes, scrollbars, base resets, TradingView theming. |
| 03 | [03-tailwind-fonts-theme.md](./03-tailwind-fonts-theme.md) | Tailwind Config, Fonts & Theme — Tailwind 3 config, design-token palette in `theme.extend`, next/font + Google Fonts loading, animations, shadows, dark-mode model. |
| 04 | [04-page-layout.md](./04-page-layout.md) | Trade Page Layout & Composition — the `trade/page.tsx` panel grid, market-info bar, chart/orderbook/order-entry/positions placement, mobile tabs, bottom sheet, responsive breakpoints, modals. |
| 05 | [05-order-entry-form.md](./05-order-entry-form.md) | Order Entry / Trade Form — market/limit/stop tabs, Buy/Sell toggle, leverage slider, size inputs, margin mode, TP/SL, reduce-only, order preview, submit handlers and Pacifica-proxy calls. |
| 06 | [06-orderbook.md](./06-orderbook.md) | Order Book — self-contained realtime depth display streaming directly from Pacifica's public WebSocket; depth bars, spread row, buy/sell ratio. Zero fight coupling. |
| 07 | [07-positions-orders.md](./07-positions-orders.md) | Positions & Open Orders Panels — positions table (PnL/ROE, close/limit-close/flip/TP-SL), open-orders table (cancel/edit), navbar quick-positions carousel, action wiring into `useOrders`. |
| 08 | [08-market-selector.md](./08-market-selector.md) | Market Selector & Price Ticker — market dropdown/search picker, token icon resolution, sparkline SVG renderer, `usePrices` live mark/oracle/funding/volume/OI stream. |
| 09 | [09-modals.md](./09-modals.md) | Trading Modals — all terminal modals (close, limit-close, TP/SL, flip, edit order, withdraw, deposit, settings). Excludes fight-only and landing modals. |
| 10 | [10-ui-primitives.md](./10-ui-primitives.md) | Reusable UI Primitives — dependency-light, no-business-logic building blocks; copy these first. Depend only on React 18 + design tokens. |
| 11 | [11-tradingview-chart.md](./11-tradingview-chart.md) | TradingView Advanced Chart Integration — React wrapper, custom Pacifica Datafeed, realtime WebSocketManager, resolutions, theming, candle backend. ⚠️ Proprietary licensed binary, not on npm. |
| 12 | [12-pacifica-lightweight-chart.md](./12-pacifica-lightweight-chart.md) | Pacifica Lightweight-Charts Chart — self-hosted candlestick chart on the open-source `lightweight-charts` npm package; fallback to the hosted TradingView widget. |
| 13 | [13-market-data-hooks.md](./13-market-data-hooks.md) | Market Data Hooks — five client hooks for order book, prices/markets, chart candles, mini-chart klines, and platform stats. (No React Query — raw `useState`/`useEffect`/WS.) |
| 14 | [14-account-trading-hooks.md](./14-account-trading-hooks.md) | Account & Trading Hooks — hooks for account data, order placement/management, deposits, USDC balance, builder-code auth, settings, wallet auth. |
| 15 | [15-websocket-realtime.md](./15-websocket-realtime.md) | WebSocket / Realtime Data — direct Pacifica WS for market + account data, and the socket.io realtime server (mostly fight/arena — what to keep vs. strip). |
| 16 | [16-pacifica-integration.md](./16-pacifica-integration.md) | Pacifica Exchange Integration (REST + Signing) — Ed25519 payload signing, REST client, on-chain USDC deposits; the two parallel integration forms. |
| 17 | [17-api-routes.md](./17-api-routes.md) | Next.js API Routes (Terminal) — backend contract for account/market-data endpoints under `apps/web/src/app/api/`; request/response shapes consumed by the hooks. |
| 18 | [18-server-adapter.md](./18-server-adapter.md) | Server Exchange Adapter Layer — server-side adapter abstraction normalizing Pacifica behind one interface; provider/factory, Redis caching wrapper, DB/auth deps. |
| 19 | [19-dependencies-env-setup.md](./19-dependencies-env-setup.md) | Dependencies, Environment & Setup — npm packages, env var names, monorepo packages, and build/run commands the terminal needs; fights-only deps flagged. |
| 20 | [20-migration-checklist-gaps.md](./20-migration-checklist-gaps.md) | Migration Checklist & Gaps — file-by-file checklist, all fight entanglements to remove, gaps the repo lacks, target folder layout, integration order, and a definition-of-done smoke test. |

## Scope & exclusions

This set documents the **trading terminal only**: charting, order book, order entry, positions/orders, market selector and price tickers, market-data and account hooks, the Pacifica REST/signing/WebSocket integration, the server adapter layer and terminal API routes, and the full design system (tokens, Tailwind, fonts, UI primitives). It **excludes** the duels/fights/arena game layer and all of admin, referrals, prize-pool, anti-cheat, and AI-bias features — these are mentioned only where a terminal file imports them, and every such interweaving is flagged inline (and aggregated in [20](./20-migration-checklist-gaps.md)) so the migrator knows exactly what to strip. The TradingView Advanced Charting Library is a proprietary licensed binary you must obtain yourself; it is not vendored here.
