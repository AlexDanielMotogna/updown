# Overview & Architecture

Part of the Trading Terminal Migration set — see [README](./README.md)

This is the **entry map** for migrating the TradeFightClub trading terminal (chart, orderbook, order entry, positions, market data, account, Pacifica integration, design system) into a fresh project. It covers the tech stack, the request/data-flow, and a full file inventory cross-linked to the sibling docs.

> **Scope note:** This doc set documents the **trading terminal only**. The duels/fights/arena game layer is excluded — but it is heavily interwoven with terminal code. Every place the migrator must *strip* fight logic is flagged inline and summarized in the structured output's `fightEntanglements`.

---

## 1. Tech Stack

All terminal code lives in the Next.js app at `apps/web` (workspace package `@tfc/web`). Versions from [`apps/web/package.json`](../../apps/web/package.json):

| Concern | Library | Version | Notes |
|---|---|---|---|
| Framework | `next` | ^14.2.20 | App Router. Dev server on **port 3001** (`next dev -p 3001`). |
| UI runtime | `react` / `react-dom` | ^18.3.1 | |
| Server state / fetching | `@tanstack/react-query` | ^5.90.16 | REST data + mutations. Shared client in `lib/queryClient.ts`. |
| Client state | `zustand` | ^5.0.1 | Auth store (persisted), WS stores, fight store. |
| Styling | `tailwindcss` | ^3.4.17 | Custom tokens (`surface-*`, `win-*`, `loss-*`). See [Design tokens](./02-design-tokens-css.md). |
| Native charts | `lightweight-charts` | ^5.1.0 | `PacificaChart`, `Sparkline`, `PerformanceChart`. |
| Advanced charts | TradingView **charting_library** | vendored (not npm) | Global script; datafeed in `lib/tradingview/`. See [Chart](./05-chart-tradingview.md). |
| Solana wallet | `@solana/wallet-adapter-*`, `@solana/web3.js`, `@solana/spl-token`, `bs58` | see package.json | Wallet connect + **client-side order signing**. |
| Realtime | `socket.io-client` | ^4.8.1 | App backend socket (fights/arena). Pacifica WS uses raw `WebSocket`. |
| Toasts | `sonner` | ^2.0.7 | Global `<Toaster>` in `layout.tsx`. |
| Charts (analytics) | `recharts` | ^3.7.0 | `PerformanceChart`. |
| Misc UI | `@mui/material`, `@mui/icons-material`, `lucide-react` | | Icons + a few inputs. |
| Validation | `zod` | ^3.23.0 | API route bodies. |
| DB (server routes only) | `@prisma/client` / `@tfc/db` | ^6.1.0 | Fight recording, referrals — **not part of pure terminal**. |

**Workspace packages:** `@tfc/db` (Prisma), `@tfc/shared` (shared TS types — admin/arena socket payloads). The terminal only needs `@tfc/shared` if you keep the socket layer; `@tfc/db` is server-side fight/referral persistence and is **stripped** for a pure terminal.

---

## 2. Two signing patterns (critical architectural fact)

Pacifica is the only exchange in scope. Mutating trading actions are **signed client-side** with the Solana wallet and sent **directly to Pacifica's REST API** — the Next.js backend is *not* in the critical path for placing an order. Next.js API routes are used for **reading** account/market data (proxy/cache) and for **recording** trades into the fight system.

- **Client-side signing** (`lib/pacifica/signing.ts`): every mutating op (create/cancel/edit order, set leverage, TP/SL, withdraw) is signed in the browser. Message = `{ data, expiry_window: 5000, timestamp, type }`, keys sorted **recursively**, JSON-compacted (no spaces), wallet-signed, base58-encoded. See [Pacifica integration](./06-pacifica-integration.md).
- **Server-side read/record** (`app/api/...`): route handlers proxy Pacifica GET endpoints and run fight bookkeeping. **This is where fight logic is interwoven.**

---

## 3. Data flow

### 3.1 Order placement (write path — client-signed)

```
 Order Entry panel (trade/page.tsx)
        |  user clicks Buy/Sell
        v
 useCreateMarketOrder / useCreateLimitOrder   (hooks/useOrders.ts)
        |  builds params + reads NEXT_PUBLIC_PACIFICA_BUILDER_CODE
        v
 lib/pacifica/signing.ts  -->  wallet.signMessage()   (Solana wallet adapter)
        |  produces { signature, timestamp }
        +-----------------------------------------------+
        v                                               v
 POST api.pacifica.fi/api/v1/orders/create     POST /api/orders   (Next route)
 (direct to Pacifica - the REAL order)         (records trade into FIGHT system,
        |                                        validates stake limit, blocked symbols
        v                                        -- STRIP for pure terminal)
 Pacifica matches order
        |
        v
 Pacifica WS pushes position/order/trade updates
        v
 usePacificaWebSocket store  -->  React state  -->  Positions / OrderBook / OrderEntry re-render
```

> The hook fires **two** requests: the real order goes straight to Pacifica; a parallel `POST /api/orders` call records the trade against a fight and enforces stake limits. For a standalone terminal, keep the Pacifica call and **delete the `/api/orders` recording call** (or make the route a no-op proxy).

### 3.2 Read path (account / markets — React Query + WS)

```
 Component
   | useAccount / usePositions / useOpenOrders / usePrices / useOrderBook / useCandles
   v
 +-------------------------- two sources --------------------------+
 | A) React Query  -->  Next API route  -->  server adapter        |
 |      (lib/api.ts)      (app/api/account/*, /markets/*, /chart/*) |
 |                        lib/server/exchanges/*-adapter.ts         |
 |                              |                                   |
 |                              v  GET api.pacifica.fi/...          |
 | B) Direct WebSocket  -->  wss://ws.pacifica.fi/ws               |
 |      (usePrices, useOrderBook, usePacificaWebSocket connect raw) |
 +-----------------------------------------------------------------+
   v
 Normalized data  -->  component render
```

Real-time **prices**, **orderbook**, and **account positions/orders/trades** stream directly from Pacifica's WebSocket in the browser (no backend hop). REST routes provide initial snapshots / fallback and historical data (trade history, candles).

### 3.3 App backend socket (mostly fight layer)

`useGlobalSocket` opens a `socket.io` connection to `NEXT_PUBLIC_WS_URL` (default `http://localhost:3002`, the `apps/realtime` service) for fight/arena/notification events. **This is the fight layer** — strip unless you keep notifications.

---

## 4. Providers & app shell

- [`app/layout.tsx`](../../apps/web/src/app/layout.tsx): loads `Inter` (`--font-inter`) + `JetBrains_Mono` (`--font-mono`), imports `globals.css`, wraps in `<Providers>`, mounts global `<Toaster>` (sonner, bottom-right, dark `#1a1a2e` / `#2d2d44`). Also mounts `<GlobalFightVideo />` — **fight layer, strip**. Sets `export const dynamic = 'force-dynamic'`.
- [`app/providers.tsx`](../../apps/web/src/app/providers.tsx): nests `QueryClientProvider` -> `WalletProviderWrapper` (dynamic import, `ssr:false`) -> `GlobalSocketInitializer` (calls `useGlobalSocket()` — fight socket) -> `ReferralTracker` (**referral, strip**) -> children. Bridges Next router into a Zustand `navigationStore`.
- `components/AppShell.tsx`: page chrome wrapper used by the trade page (`<AppShell>` at `trade/page.tsx:1106`).

For a pure terminal: keep `QueryClientProvider` + `WalletProvider`; drop `GlobalSocketInitializer`, `ReferralTracker`, `GlobalFightVideo`.

---

## 5. Core shared lib modules

| File | Purpose | Covered in |
|---|---|---|
| [`lib/api.ts`](../../apps/web/src/lib/api.ts) | Typed REST client (`fetchApi<T>`). Unwraps `{ success, data }`. Exposes `placeOrder`, `getAccountSummary`, `getPositions`, `getOpenOrders`, `getMarkets`, `getPrices` + fight/referral/notification calls. `API_URL = NEXT_PUBLIC_API_URL \|\| '/api'`. **Types `Position`, `OpenOrder`, `AccountSummary`, `Market`, `MarketPrice` are essential; `Fight*`, `Referral*`, `StakeInfo` are fight/referral — strip.** | [Account & data](./07-account-positions-orders.md) |
| [`lib/queryClient.ts`](../../apps/web/src/lib/queryClient.ts) | Shared `QueryClient` (`staleTime: 10s`, `refetchOnWindowFocus`, `retry: 2`, `gcTime: 24h`). Plus localStorage notification-read helpers. | this doc |
| [`lib/store.ts`](../../apps/web/src/lib/store.ts) | Zustand: **`useAuthStore`** (persisted, key `tfc-auth`) — keep; **`useFightStore`** + **`useStore`** (fights) — strip. | [Account & data](./07-account-positions-orders.md) |
| [`lib/formatters.ts`](../../apps/web/src/lib/formatters.ts) | `formatPrice`, `formatUSD`, `formatVolume`, `formatQuantity`, `formatPercent`, `formatFundingRate`, `getPriceDecimals`, `formatDateTime(Short)`, `getBaseToken`, `symbolToPacifica`. No fight deps. | [Design tokens](./02-design-tokens-css.md) |
| `lib/pacifica/api-client.ts` | Direct Pacifica REST (create/cancel/edit/leverage/tpsl/positions/account/orders/markets/prices/history). `PACIFICA_API_URL = NEXT_PUBLIC_PACIFICA_API_URL \|\| https://api.pacifica.fi`. | [Pacifica integration](./06-pacifica-integration.md) |
| `lib/pacifica/signing.ts` | Wallet signing + signed-request builders. | [Pacifica integration](./06-pacifica-integration.md) |
| `lib/pacifica/deposit-instruction.ts` | Solana SPL deposit instruction builder. | [Account & data](./07-account-positions-orders.md) |
| `lib/trading/utils.ts` | Trade math helpers. | [Order entry](./04-order-entry.md) |
| `lib/tradingview/` (`PacificaDatafeed.ts`, `WebSocketManager.ts`, `index.ts`) | TradingView datafeed backed by Pacifica candles/WS. | [Chart](./05-chart-tradingview.md) |

---

## 6. Component inventory

In `apps/web/src/components/`. **F = fight/duel; R = referral; A = AI bias; D = deposit/withdraw.**

| Component | Role | Flag | Covered in |
|---|---|---|---|
| `AppShell.tsx` | Page chrome / nav wrapper | — | [Layout](./03-layout-shell.md) |
| `Header.tsx` | Top bar (wallet, balance) | — | [Layout](./03-layout-shell.md) |
| `WalletProvider.tsx` / `WalletButton.tsx` | Solana wallet adapter setup + connect button | — | [Pacifica integration](./06-pacifica-integration.md) |
| `MarketSelector.tsx` | Symbol picker dropdown | — | [Order entry](./04-order-entry.md) |
| `OrderBook.tsx` | Live orderbook (Pacifica WS) | — | [Orderbook](./08-orderbook.md) |
| `TradingViewChartAdvanced.tsx` / `TradingViewChart.tsx` | TradingView charting_library wrapper; exports `ChartWidget`, `onQuickOrder`, `onWidgetReady` | — | [Chart](./05-chart-tradingview.md) |
| `PacificaChart.tsx` | lightweight-charts fallback chart | — | [Chart](./05-chart-tradingview.md) |
| `Positions.tsx` | Positions + open-orders table; exports `Position`, `LimitCloseParams`, `MarketCloseParams`, `TpSlParams` | — | [Account & data](./07-account-positions-orders.md) |
| `TradesHistoryTable.tsx` | Trade/order history table | — | [Account & data](./07-account-positions-orders.md) |
| `EditOrderModal.tsx` | Edit limit order | — | [Order entry](./04-order-entry.md) |
| `TpSlModal.tsx` | Set TP/SL | — | [Order entry](./04-order-entry.md) |
| `MarketCloseModal` / `LimitCloseModal` / `QuickPositionModal` / `FlipPositionModal` / `CloseOppositeModal` | Position-management dialogs | — | [Order entry](./04-order-entry.md) |
| `QuickPositionsBar.tsx` | Quick-trade bar | — | [Order entry](./04-order-entry.md) |
| `Slider` / `Toggle` / `Dropdown` / `Portal` / `Spinner` / `Skeletons` / `TokenIcon` / `Sparkline` | UI primitives | — | [Design tokens](./02-design-tokens-css.md) |
| `SettingsModal.tsx` | Trade settings | — | [Order entry](./04-order-entry.md) |
| `NotificationBell.tsx` | Notifications dropdown | (notif) | [Layout](./03-layout-shell.md) |
| `deposit/` + `WithdrawModal.tsx` | Deposit/withdraw USDC | D | [Account & data](./07-account-positions-orders.md) |
| `PacificaWebSocketInit.tsx` / `PacificaConnectionSync.tsx` | Pacifica WS bootstrap + connection sync | — | [Pacifica integration](./06-pacifica-integration.md) |
| `PerformanceChart.tsx` | Recharts equity chart | — | [Account & data](./07-account-positions-orders.md) |
| `AiBiasWidget.tsx` / `AiDisclaimerModal.tsx` | AI market-bias overlay (trade page line 4026) | A | mention-only |
| `FightBanner` / `ActiveFightsSwitcher` / `FightCard` / `FightList` / `CancelFightModal` / `GlobalFightVideo` / `BetaGate` / `BetaAccessDenied` / `NoPacificaModal` | Fight/beta layer rendered inside trade page | F | strip |
| `ClaimPrizeButton` / `PrizesBanner` / `UserPrizesSection` / `ReferralTracker` | prize/referral | F/R | strip |

---

## 7. Hook inventory

From [`hooks/index.ts`](../../apps/web/src/hooks/index.ts).

| Hook | Role | Flag | Covered in |
|---|---|---|---|
| `useAuth` | Wallet connect -> backend auth token (`useAuthStore`) | — | [Pacifica integration](./06-pacifica-integration.md) |
| `useAccount` / `usePositions` / `useAccountInfo` / `useAccountSettings` / `useOpenOrders` | Account summary, positions, settings, open orders | — | [Account & data](./07-account-positions-orders.md) |
| `useMarkets` / `useMarket` | Market metadata (tick/lot/leverage) | — | [Account & data](./07-account-positions-orders.md) |
| `usePrices` | Live mark/oracle/funding via Pacifica WS | — | [Orderbook](./08-orderbook.md) |
| `useOrderBook` (exports `AggLevel`) | Live orderbook via Pacifica WS | — | [Orderbook](./08-orderbook.md) |
| `useCandles` (exports `CandleData`) / `useKlineData` | OHLC candles | — | [Chart](./05-chart-tradingview.md) |
| `usePacificaWebSocket` / `usePacificaWsStore` (exports `PacificaPosition/Order/Trade`) | Account WS stream store | — | [Pacifica integration](./06-pacifica-integration.md) |
| `useOrders` (`useCreateMarketOrder`, `useCreateLimitOrder`, `useCancelOrder`, `useCancelStopOrder`, `useCancelAllOrders`, `useSetPositionTpSl`, `useCreateStopOrder`, `useCreateStandaloneStopOrder`, `useSetLeverage`, `useSetMarginMode`, `useWithdraw`, `useEditOrder`, `useBatchOrders`; exports `BatchAction*`) | All order mutations (client-signed). **`fightId`/`leverage`/`isPreFightFlip` params are fight-recording — strip.** | F-partial | [Order entry](./04-order-entry.md) |
| `useTradeHistory` / `useOrderHistory` / `useUserTrades` | Historical fills/orders | — | [Account & data](./07-account-positions-orders.md) |
| `usePacificaConnection` | Pacifica link status | — | [Pacifica integration](./06-pacifica-integration.md) |
| `useBuilderCode` (`useBuilderCodeStatus`, `useApproveBuilderCode`, `getBuilderCode`) | Pacifica builder-code (fee) approval | — | [Pacifica integration](./06-pacifica-integration.md) |
| `useDeposit` / `useUsdcBalance` | USDC deposit + balance | D | [Account & data](./07-account-positions-orders.md) |
| `useSettings` (exports `Settings`) / `useUrlState` / `useMultipleUrlState` | Trade settings + URL state | — | [Order entry](./04-order-entry.md) |
| `useSocket` / `useArenaSocket` / `useGlobalSocket` (`useGlobalSocketStore`, `useFightRoom`) | App backend socket.io | F | strip |
| `useFight` / `useFights` / `useMyActiveFights` / `useStakeInfo` / `useFightPositions` / `useFightTrades` / `useFightOrders` / `useFightOrderHistory` | Fight layer (imported by trade page) | F | strip |
| `useAiBias` | AI bias data | A | mention-only |
| `useNotifications` / `useUnreadNotificationCount` / `useMarkNotificationAsRead` / `useMarkAllNotificationsAsRead` | Notifications | (notif) | [Layout](./03-layout-shell.md) |
| `useBetaAccess` / `useMyPrizes` / `usePrizePool` / `useStats` | beta/prize/stats | F | strip |

---

## 8. API routes (Next.js handlers)

Under `apps/web/src/app/api/` (default client base `/api`).

| Route | Method(s) | Purpose | Fight-entangled? |
|---|---|---|---|
| `/api/orders` | POST / DELETE | Record order into fight system, validate stake, cancel-all proxy. **NOT the real order placement** (that goes direct to Pacifica). | **Yes** — `validateStakeLimit`, `assertSymbolNotBlocked`, `recordAllTrades`, `fight_id` |
| `/api/orders/[orderId]`, `/api/orders/edit`, `/api/orders/stop`, `/api/orders/batch` | various | Order action recording/proxy | partial |
| `/api/account/summary` `/positions` `/orders` `/leverage` `/margin` `/withdraw` | GET/POST | Account data proxy via server adapter | mostly clean |
| `/api/markets` `/markets/prices` `/markets/[symbol]` | GET | Market metadata + prices | clean |
| `/api/chart/candles` | GET | OHLC for TradingView datafeed | clean |
| `/api/auth/*` | POST/GET | Wallet auth + Pacifica link | clean-ish |
| `/api/fights/*`, `/api/leaderboard`, `/api/prize*`, `/api/referrals/*`, `/api/stats`, `/api/beta`, `/api/ai` | — | **Fight/referral/AI — out of scope** | n/a |

Server adapters live in `lib/server/exchanges/` (`adapter.ts`, `pacifica-adapter.ts`, `cached-adapter.ts`, `provider.ts`) and normalize Pacifica REST responses. See [Pacifica integration](./06-pacifica-integration.md).

---

## 9. The trade page (`app/trade/page.tsx`)

A single ~4046-line client component.

- `export default TradePage` -> `<Suspense fallback={TradePageLoading}>` -> `TradePageContent()` (line 39) holds **all** terminal state and imports ~30 hooks in one statement (line 7).
- Constants: `DEFAULT_MARKET = { symbol: 'BTC-USD', name: 'Bitcoin', maxLeverage: 50 }`, `PACIFICA_DEPOSIT_URL = 'https://app.pacifica.fi?referral=TFC'`, `TRADECLUB_FEE = 0.0005` (0.05% builder fee).
- Layout (return ~line 1106): `<AppShell>` -> `<FightBanner/>` (**strip**) -> `<MarketSelector>` -> `<TradingViewChartAdvanced ... onQuickOrder onWidgetReady>` -> `<OrderBook symbol currentPrice oraclePrice tickSize>` -> `<Positions .../>` -> desktop **Order Entry** ("Place Order", lines 2455/3399) -> mobile bottom-sheet variant -> `<AiBiasWidget>` (line 4026, AI layer).
- Fight hooks imported directly: `useFight, useStakeInfo, useFightPositions, useFightTrades, useFightOrders, useFightOrderHistory` plus `<FightBanner>`, `<ActiveFightsSwitcher>`, `<BetaGate>`. Remove/replace when extracting. Order-entry calls thread `fightId` through `useOrders` — strip that param.

Decomposed across: [Layout](./03-layout-shell.md), [Order entry](./04-order-entry.md), [Chart](./05-chart-tradingview.md), [Orderbook](./08-orderbook.md), [Account & data](./07-account-positions-orders.md).

---

## 10. Environment variables (terminal)

| Var | Default | Used by |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `/api` | `lib/api.ts` |
| `NEXT_PUBLIC_PACIFICA_API_URL` | `https://api.pacifica.fi` | `lib/pacifica/api-client.ts` |
| `NEXT_PUBLIC_PACIFICA_WS_URL` | `wss://ws.pacifica.fi/ws` | `usePacificaWebSocket`, `usePrices`, `useOrderBook` |
| `NEXT_PUBLIC_PACIFICA_BUILDER_CODE` | `TradeClub` | `useOrders.ts` |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:3002` | `useGlobalSocket` (**fight socket — strip**) |
| `NEXT_PUBLIC_SOLANA_RPC` (+ related) | — | `WalletProvider.tsx`, `useUsdcBalance.ts`, `useDeposit.ts` |
| `PACIFICA_API_URL` (server) | `https://api.pacifica.fi` | `app/api/orders/route.ts` + server adapters |

Server-only (NOT public): `EXCHANGE_KEY_ENCRYPTION_SECRET`, Prisma `DATABASE_URL` — only if keeping the fight/recording backend.

---

## 11. Keep vs. strip (quick reference)

**Keep:** `layout.tsx` (minus GlobalFightVideo), `providers.tsx` (minus GlobalSocket/ReferralTracker), `lib/api.ts` (terminal types), `queryClient.ts`, `useAuthStore`, `formatters.ts`, all Pacifica lib + WS hooks, order/account/market/chart hooks, `OrderBook`, `Positions`, `TradingViewChartAdvanced`, `MarketSelector`, order/close/TPSL modals, UI primitives, `app/api/account|markets|chart|orders(proxy)`, server adapters.

**Strip:** the fight-entanglement items below, the AI bias widget/hook, referral/prize components & routes, the socket.io fight layer (`useGlobalSocket`/`useArenaSocket`/`useSocket`), `useFightStore`/`useStore`, and the `fightId`/`leverage`/`isPreFightFlip` plumbing in `useOrders` + `/api/orders`.
