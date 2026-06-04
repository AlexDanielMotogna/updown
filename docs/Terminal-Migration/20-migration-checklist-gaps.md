# Migration Checklist & Gaps

Part of the Trading Terminal Migration set — see [README](./README.md).

This is the **completeness critic** for the whole doc set (01–19). It gives you (a) a file-by-file migration checklist, (b) every fight/duel/arena entanglement to remove grouped by file, (c) the gaps the repo does **not** contain, (d) a minimal fresh-repo folder layout, (e) a strict integration order, and (f) a definition-of-done smoke test.

> Read this **last**, after the other 19 docs, but use it as your task tracker while you migrate. Where a claim here corrects a sibling doc, it is flagged **⚠️ CORRECTION**.

---

## 0. ⚠️ CORRECTIONS the migrator MUST internalize first

Two claims propagated across the slice docs are **wrong** and will mislead you if you trust them. I verified the source.

### 0.1 There is NO "direct-to-Pacifica" order call from the browser. Order placement IS the Next proxy.

[01-overview-architecture.md](./01-overview-architecture.md) §3.1 (the ASCII diagram), §5, and several slice docs claim the hook fires **two** requests — a real order "direct to `api.pacifica.fi`" plus a "parallel `POST /api/orders`" that only records fight data. **This is false.**

Verified in `apps/web/src/hooks/useOrders.ts` and `apps/web/src/app/api/orders/route.ts`:

- `useCreateMarketOrder` / `useCreateLimitOrder` sign client-side, then fire **one** request: `POST /api/orders`.
- That route (`route.ts:85-137`) **is** the placement path — it builds the Pacifica `create_market` / `create` body and `fetch()`s `${PACIFICA_API_URL}/api/v1/orders/create_market`. The browser never calls Pacifica directly for orders.
- Fight bookkeeping (`assertSymbolNotBlocked`, `validateStakeLimit`, `recordAllTrades`, `recordOrderAction`) is woven **around** that proxy call — `validateStakeLimit` runs *before* the Pacifica fetch and can **block the order** (throws `StakeLimitError`); recording runs *after*.

**Migration implication:** you cannot "just delete the recording call." You must **keep** `POST /api/orders` as the order proxy and **surgically remove** the fight lines (08-11, 51-79, 173-210 of `route.ts`) while preserving lines 82-169 (the Pacifica proxy + error handling). Every other mutation is the same pattern: client signs → POST to a Next proxy route → route forwards to Pacifica. See the per-route fetch sites in `useOrders.ts`: `/api/orders`, `/api/orders/stop/create`, `/api/orders/stop/cancel`, `/api/positions/tpsl`, `/api/account/leverage`, `/api/account/margin`, `/api/orders/edit`, `/api/orders/batch`, `/api/account/withdraw`.

### 0.2 `lib/server/orders.ts` is NOT generic order code — it is ~95% fight.

Confirmed exports: `getCurrentPrice` (terminal-relevant), plus `assertSymbolNotBlocked`, `validateStakeLimit` (both fight stake-cap gating). Treat the file as fight-only **except** `getCurrentPrice(symbol)`. ([18-server-adapter.md](./18-server-adapter.md) said this; restating because `route.ts` imports it.)

---

## 1. File-by-file migration checklist

Legend for **Action**: **COPY** = port verbatim · **ADAPT** = port then strip/rewrite specific lines · **STRIP** = do not migrate (fight/duel/arena/AI/referral) · **SUPPLY** = not in repo, you must provide.

### 1.1 App shell, providers, layout

| Source path | Action | Notes |
|---|---|---|
| `apps/web/src/app/layout.tsx` | **ADAPT** | Keep fonts (`Inter --font-inter`, `JetBrains_Mono --font-mono`), `globals.css`, `<Providers>`, `<Toaster>`. Remove `import { GlobalFightVideo }` and the `<GlobalFightVideo />` element. See [03](./03-tailwind-fonts-theme.md). |
| `apps/web/src/app/providers.tsx` | **ADAPT** | Keep `QueryClientProvider` + `WalletProviderWrapper` (dynamic, `ssr:false`). Remove `GlobalSocketInitializer` (calls fight socket) and `ReferralTracker`. |
| `apps/web/src/components/AppShell.tsx` | **ADAPT** | Page chrome; verify it doesn't pull fight banners. |
| `apps/web/src/components/Header.tsx` | **ADAPT** | Currently modified in working tree (`git status`). Carries wallet/balance + deposit entry; strip any fight/notification nav. |
| `apps/web/src/components/WalletProvider.tsx` / `WalletButton.tsx` | **COPY** | Confirm `NEXT_PUBLIC_SOLANA_*` env names inside (see §3). |
| `apps/web/next.config.mjs` | **ADAPT** | Keep `serverComponentsExternalPackages:['@prisma/client','prisma']`, `output:'standalone'`, coingecko `remotePatterns`. Drop `react-markdown/remark-gfm/rehype-slug` from `transpilePackages`; drop the `tfc.gg` redirect. |
| `apps/web/tailwind.config.ts` | **ADAPT** | Keep `surface-*/win-*/loss-*/primary-*`. Drop the `live` color scale (fight badge dup of `loss`). See [02](./02-design-tokens-css.md). |
| `apps/web/src/app/globals.css` | **ADAPT** | Strip `.badge-live/.badge-waiting/.badge-finished/.badge-win/.badge-loss` and the VS-Arena keyframes/utilities (lines ~794-975). Keep base tokens, `.card`, `.select` (copy the inline chevron data-URI verbatim, line 178), scrollbar rules. Decide whether `.btn-primary` stays orange `#f97316`. |
| `apps/web/public/tradingview-custom.css` | **COPY** | TV DOM overrides; verify build-hashed selector `.group-wWM3zP_M-` against your TV lib version. |
| `apps/web/postcss.config.mjs` | **COPY** | Tailwind+autoprefixer pipeline. |

### 1.2 Core lib

| Source path | Action | Notes |
|---|---|---|
| `apps/web/src/lib/api.ts` | **ADAPT** | Keep types `Position, OpenOrder, AccountSummary, Market, MarketPrice` + `placeOrder/getAccountSummary/getPositions/getOpenOrders/getMarkets/getPrices`. Remove `Fight*`, `Referral*`, `StakeInfo`, `getFights/createFight/joinFight`, all `Referral*` calls. |
| `apps/web/src/lib/queryClient.ts` | **COPY** | `staleTime 10s`, `retry 2`, `gcTime 24h`. Drop notification-read localStorage helpers if dropping notifications. |
| `apps/web/src/lib/store.ts` | **ADAPT** | Keep `useAuthStore` (persisted key `tfc-auth`). Remove `useFightStore` and `useStore` (fights list). |
| `apps/web/src/lib/formatters.ts` | **COPY** | No fight deps. |
| `apps/web/src/lib/trading/utils.ts` | **COPY** | `calculatePositionMetrics/calculateTpPrice/calculateSlPrice/roundToLotSize/roundToTickSize/formatPrice/PositionInfo`. |
| `apps/web/src/lib/pacifica/api-client.ts` | **COPY** | Direct Pacifica REST client. |
| `apps/web/src/lib/pacifica/signing.ts` | **COPY** | All `createSigned*` builders — load-bearing, no fight logic. |
| `apps/web/src/lib/pacifica/deposit-instruction.ts` | **COPY** | SPL deposit instruction builder. |
| `apps/web/src/lib/tradingview/{index.ts,PacificaDatafeed.ts,WebSocketManager.ts}` | **COPY** | TV datafeed over Pacifica WS. `WebSocketManager` hard-codes `wss://ws.pacifica.fi/ws`. |
| `apps/web/src/lib/notify.ts` | **COPY** | Toast helper (uses sonner + queryClient). |

### 1.3 Hooks

| Source path | Action | Notes |
|---|---|---|
| `apps/web/src/hooks/index.ts` | **ADAPT** | Barrel; drop fight/AI/notification re-exports. |
| `apps/web/src/hooks/useOrders.ts` | **ADAPT** | **Strip all fight plumbing** (see §2). Remove `fightId/leverage/isPreFightFlip` from `CreateMarketOrderParams`, `CreateLimitOrderParams`, `SetPositionTpSlParams`, `CreateStopOrderParams`, `CreateStandaloneStopOrderParams`; remove `fight_id/leverage/is_pre_fight_flip` from POST bodies; delete the `if (variables.fightId)` invalidation blocks (lines ~163-179, ~243, ~526, ~704, ~795, ~812-814). |
| `apps/web/src/hooks/useAccount.ts` | **COPY** | Clean. |
| `apps/web/src/hooks/usePositions.ts` | **COPY** | Clean. Use this, **not** `useFightPositions`. |
| `apps/web/src/hooks/usePrices.ts` | **COPY** | Pure Pacifica data. (Consumer `AiBiasWidget` is out of scope — ignore it.) |
| `apps/web/src/hooks/useOrderBook.ts` | **COPY** | Zero fight logic. |
| `apps/web/src/hooks/useCandles.ts` / `useKlineData.ts` | **COPY** | OHLC. |
| `apps/web/src/hooks/usePacificaWebSocket.ts` | **COPY** | Account WS store (`usePacificaWsStore`). |
| `apps/web/src/hooks/usePacificaConnection.ts` | **COPY** | Needs `GET /api/auth/pacifica/me` (SUPPLY route). |
| `apps/web/src/hooks/useBuilderCode.ts` | **COPY** | Builder-code (fee) approval. |
| `apps/web/src/hooks/useDeposit.ts` / `useUsdcBalance.ts` | **COPY** | On-chain USDC deposit/balance (new in working tree). |
| `apps/web/src/hooks/useSettings.ts` | **COPY** | localStorage `tfc-settings` + `tfc-settings-changed` event. |
| `apps/web/src/hooks/useUserTrades.ts` / `useTradeHistory`/`useOrderHistory` | **COPY** | History. |
| `apps/web/src/hooks/useUrlState.ts` | **COPY** | URL state. |
| `apps/web/src/hooks/useAuth.ts` | **ADAPT** | Auth-only, but no-op the referral imports (`getStoredReferralCode/clearStoredReferralCode` from `@/lib/hooks/useReferralTracking`). |
| `apps/web/src/hooks/useStats.ts` | **ADAPT** (or STRIP) | If kept, drop `fightVolume`/`fightsCompleted`; receives `platform:stats` via `useGlobalSocket` — see §2. |
| `apps/web/src/hooks/useStakeInfo.ts` | **STRIP** | 100% fight (socket.io `join_fight`, `STAKE_INFO`). |
| `apps/web/src/hooks/useFight*.ts` (`useFight, useFights, useFightPositions, useFightTrades, useFightOrders, useFightOrderHistory, useMyActiveFights`) | **STRIP** | Fight layer. |
| `apps/web/src/hooks/useSocket.ts` | **STRIP** | Fight scoring socket. |
| `apps/web/src/hooks/useGlobalSocket.ts` | **STRIP** | Arena/admin singleton socket. Only `platform:stats` is terminal-relevant — re-implement minimally if you keep `useStats`. |
| `apps/web/src/hooks/useArenaSocket.ts` | **STRIP** | Lobby fight-list. |
| `apps/web/src/hooks/useAiBias.ts` | **STRIP** | AI layer. |
| `apps/web/src/hooks/useNotifications.ts` etc. | **STRIP** (optional) | Not core terminal. |
| `apps/web/src/hooks/useBetaAccess.ts` / `useMyPrizes.ts` / `usePrizePool.ts` | **STRIP** | Beta/prize. |

### 1.4 Components — terminal

| Source path | Action | Notes |
|---|---|---|
| `apps/web/src/app/trade/page.tsx` (4046 lines) | **ADAPT** (heaviest job) | See §2.1 for every fight site. |
| `apps/web/src/components/MarketSelector.tsx` | **ADAPT** | Remove prop `blockedSymbols?: string[]` and all `isBlocked` branches (rows, badge, tooltip, click guard). |
| `apps/web/src/components/OrderBook.tsx` | **COPY** | Game-agnostic. `oraclePrice` prop is declared but unread — drop or wire. `onPriceClick` is **not** wired at call sites — wire it yourself. |
| `apps/web/src/components/Positions.tsx` | **ADAPT** | Drop `readOnly`/`readOnlyMessage` props (fight read-only). Exports `Position, LimitCloseParams, MarketCloseParams, TpSlParams, TpSlOrder` — keep. |
| `apps/web/src/components/TradesHistoryTable.tsx` | **COPY** | |
| `apps/web/src/components/TradingViewChartAdvanced.tsx` | **ADAPT** | Keep `onWidgetReady`/`onQuickOrder`. The `createShape/removeShape/removeEntity/removeAllShapes` on `ChartWidget` exist only for the AI-bias overlay — keep the interface but note no terminal consumer. |
| `apps/web/src/components/TradingViewChart.tsx` | **COPY (optional)** | Secondary public-embed widget; its only other consumer is `AiBiasWidget` (out of scope). |
| `apps/web/src/components/PacificaChart.tsx` | **COPY** | lightweight-charts fallback. Needs a `useCandles` hook ([12](./12-pacifica-lightweight-chart.md)). |
| `apps/web/src/components/Sparkline.tsx` | **COPY (optional)** | Only used by out-of-scope profile; ships mock data. |
| `apps/web/src/components/PerformanceChart.tsx` | **COPY (optional)** | recharts equity chart. |
| `apps/web/src/components/EditOrderModal.tsx` | **COPY** | |
| `apps/web/src/components/TpSlModal.tsx` | **COPY** | Needs `getPrice` returning `{price,lotSize,tickSize,maxLeverage}`. |
| `apps/web/src/components/MarketCloseModal.tsx` / `LimitCloseModal.tsx` / `FlipPositionModal.tsx` | **COPY** | Fight-agnostic; only their `onConfirm` callers inject `fightId` — strip at call site. |
| `apps/web/src/components/QuickPositionModal.tsx` / `QuickPositionsBar.tsx` | **COPY** | UI clean; calls order hooks (strip recording in the hooks). |
| `apps/web/src/components/CloseOppositeModal.tsx` | **COPY** | "Don't show again" checkbox is unwired (SUPPLY suppression). |
| `apps/web/src/components/SettingsModal.tsx` | **COPY** | |
| `apps/web/src/components/NoPacificaModal.tsx` | **COPY** | Needs `useAuthStore` shape + `GET /api/auth/pacifica/me`. |
| `apps/web/src/components/deposit/DepositModal.tsx` | **COPY** | MUI-based; mainnet RPC + Pacifica program constants (see §3). |
| `apps/web/src/components/WithdrawModal.tsx` | **COPY** | |
| `apps/web/src/components/PacificaWebSocketInit.tsx` / `PacificaConnectionSync.tsx` | **COPY** | WS bootstrap. |
| `apps/web/src/components/TokenIcon.tsx` | **COPY** | External icon CDNs (see §3). |
| `apps/web/src/components/{Dropdown,Slider,Toggle,Portal,Spinner,Skeletons}.tsx` | **COPY/ADAPT** | Primitives ([10](./10-ui-primitives.md)). In `Skeletons.tsx` strip `FightCardSkeleton, ArenaSkeleton, LeaderboardSkeleton, LeaderboardRowSkeleton, ProfileSkeleton`; keep `Skeleton, SkeletonText/Avatar/Button/Card, PositionRowSkeleton, TradePanelSkeleton, PageLoadingSkeleton`. Add the `shimmer` keyframe to tailwind config or skeletons render static. |
| `apps/web/src/components/index.ts` | **ADAPT** | Barrel mixes terminal + fight exports (`FightCard`, `CancelFightModal`, `GlobalFightVideo`) — drop the fight ones. The six UI primitives are NOT in this barrel. |

### 1.5 Components / hooks — STRIP entirely (fight/arena/AI/referral/prize/beta/admin)

`ActiveFightsSwitcher.tsx`, `AiBiasWidget.tsx`, `AiDisclaimerModal.tsx`, `BetaAccessDenied.tsx`, `BetaGate.tsx`, `CancelFightModal.tsx`, `ClaimPrizeButton.tsx`, `FightBanner.tsx`, `FightCard.tsx`, `FightList.tsx`, `GlobalFightVideo.tsx`, `NotificationBell.tsx` (optional), `PrizesBanner.tsx`, `ReferralTracker.tsx`, `UserPrizesSection.tsx`, `MobilePhantomRedirect.tsx`/`MobileWalletRedirect.tsx` (optional), `components/admin/**`, `components/docs/**`, `components/landing/**`. Plus the lobby/leaderboard/fight/admin pages under `apps/web/src/app/`.

### 1.6 Server (API routes + adapters)

| Source path | Action | Notes |
|---|---|---|
| `apps/web/src/app/api/orders/route.ts` | **ADAPT** | Keep Pacifica proxy (lines ~82-169 + DELETE cancel_all). Remove imports `validateStakeLimit/assertSymbolNotBlocked` (orders.ts), `recordAllTrades/emitStakeInfoForUser` (trade-recording), `recordOrderAction`; remove `fight_id/leverage/is_pre_fight_flip` destructure and the two `recordOrderAction` blocks. |
| `apps/web/src/app/api/orders/{[orderId],edit,batch,stop}/**` | **ADAPT** | Pacifica proxies; strip any `recordOrderAction`/fight calls. |
| `apps/web/src/app/api/positions/tpsl/**` | **ADAPT** | Pacifica proxy. |
| `apps/web/src/app/api/account/{summary,positions,orders,leverage,margin,withdraw}/**` | **ADAPT** | Mostly clean proxies. `leverage/margin/withdraw` accept client signature with **no JWT ownership check** — SUPPLY auth hardening if needed. |
| `apps/web/src/app/api/markets/**`, `markets/prices`, `markets/[symbol]` | **COPY** | Clean. |
| `apps/web/src/app/api/chart/candles/**` | **COPY** | Pacifica + Binance/Bybit/CoinGecko fallbacks; reads `USE_EXCHANGE_ADAPTER`. |
| `apps/web/src/app/api/auth/**` | **ADAPT** | Wallet auth + `pacifica/me`. Strip referral; `withAuth` gates on `User.status` (BANNED/DELETED) — slim for terminal-only. |
| `apps/web/src/app/api/builder-code/**`, `fees/**`, `users/[userId]/trades/**` | **COPY** | |
| `apps/web/src/lib/server/exchanges/{adapter,pacifica-adapter,cached-adapter,provider}.ts` | **COPY/ADAPT** | Normalize Pacifica REST. `provider.getUserAdapter(userId)` is a stub that always returns Pacifica (DB lookup is a TODO). `cached-adapter` uses ioredis (optional). ⚠️ `PacificaAdapter.getAccount` sums `pos.unrealized_pnl` but the REST Position type lacks that field → `unrealizedPnl` is effectively 0/unreliable; fix if you need it. |
| `apps/web/src/lib/server/pacifica.ts` / `pacifica-signing.ts` | **COPY** | REST client + server signing. Not in any slice doc's read scope — port carefully. |
| `apps/web/src/lib/server/orders.ts` | **ADAPT** | Keep only `getCurrentPrice`. Strip `validateStakeLimit/assertSymbolNotBlocked` + raw-SQL fight reads. |
| `apps/web/src/lib/server/trade-recording.ts` | **ADAPT** (or STRIP) | If you want the platform `trades` table, keep the bare Trade insert; strip `recordFightTradeWithDetails`, referral commissions, `broadcastAdminTrade`, `emitStakeInfo/emitPlatformStats` (to `REALTIME_URL`), and the `FightStatus` import. Otherwise STRIP the whole file and the route call. |
| `apps/web/src/lib/server/order-actions.ts` | **STRIP** (optional) | `TfcOrderAction` rows feed fight-exposure queries. |
| `apps/web/src/lib/server/fight-exposure.ts` (+ `.test.ts`) | **STRIP** | Fights-only. |
| `apps/web/src/lib/server/{auth,db,errors,error-codes,logger,feature-flags}.ts` | **COPY/ADAPT** | `auth.ts` JWT; `db.ts` Prisma singleton; errors/logger needed by routes. `feature-flags.isTradingEnabled` referenced by orders route — SUPPLY or stub. |
| `apps/web/src/lib/server/services/account.ts` | **ADAPT** | `getAccountAddress` requires a `pacificaConnection` row keyed by JWT `userId` (shared User/PacificaConnection schema). |
| `apps/web/src/lib/server/{admin-auth,admin-realtime,anti-cheat,referral-*,treasury,ip-geo}.ts` | **STRIP** | Non-terminal. |

### 1.7 Workspace packages

| Source path | Action | Notes |
|---|---|---|
| `packages/db` (`@tfc/db`) | **ADAPT/SUPPLY** | Keep `prisma` singleton + the `User` + `PacificaConnection` models. Drop fight tables/enums and `settlement-lock`. In a fresh repo, define a minimal Prisma schema (see §3). |
| `packages/shared` (`@tfc/shared`) | **ADAPT** | Copy only order/Pacifica constants (`CANDLE_INTERVALS, ORDER_SIDES, ORDER_TYPES, PACIFICA_SIDES, PACIFICA_TRADE_SIDES, MIN_LEVERAGE`) into a local `lib/constants.ts`. Drop `FIGHT_*, PARTICIPANT_SLOTS, PNL_TICK_INTERVAL_MS, LEADERBOARD_RANGES` and all `Admin*Payload` types. You can then delete the workspace dependency entirely. |
| `packages/tsconfig` (`@tfc/tsconfig`) | **SUPPLY** | Replace `extends:"@tfc/tsconfig/nextjs.json"` with a standard Next tsconfig; keep `@/* -> ./src/*`, `strictNullChecks:true`. |
| `apps/realtime/**` | **STRIP** | socket.io server is 100% fight/arena/admin. Its `pacifica-client.ts` getPrices/getPositions/getTradeHistory are for **server-side fight scoring**, not the terminal UI. |
| `apps/api/**` | **STRIP/verify** | Confirm the terminal does not depend on it (terminal uses Next route handlers). |

### 1.8 SUPPLY EXTERNALLY (not in repo)

| Item | Why |
|---|---|
| `apps/web/public/charting_library/**` | Proprietary TradingView Advanced Charting Library binary (`charting_library.standalone.js`, `bundles/`, `datafeed-api.d.ts`). **It IS present in this repo at `apps/web/public/charting_library/` but is licensed** — you must obtain your own copy under TradingView's license, do not redistribute. Loaded as a global script. |
| `window.TradingView` ambient TS declaration | Treated as `any`; supply your own `.d.ts`. |
| `GET /api/auth/pacifica/me` handler | Returns `{ connected, pacificaAddress, connectedAt }`; consumed by `usePacificaConnection`/`NoPacificaModal`. Referenced but its body isn't in the slice docs — verify/port. |
| Favicon/watermark PNGs under `public/images/logos/` | `favicon-white-192.png` (chart watermark) + metadata icons. |
| Real `high24h/low24h` source | `usePrices` fabricates oracle ±2%. |
| Real sparkline klines | Sparkline ships `generateMockTrendData`. |

---

## 2. Every fight/duel/arena entanglement to remove, grouped by file

> Neutralization rule of thumb: **delete fight params from interfaces**, **delete fight keys from request bodies**, **delete fight-query invalidations**, and at JSX/page level **replace fight-filtered data with the plain terminal data**.

### 2.1 `apps/web/src/app/trade/page.tsx` (the big one)

| Site | What it is | Neutralize |
|---|---|---|
| Line 7 import | `useFight, useStakeInfo, useFightPositions, useFightTrades, useFightOrders, useFightOrderHistory` (verified in source) | Remove from the import; delete their call sites. |
| `useFight()` | `inActiveFight, fightMaxSize, fightId` used in `handlePlaceOrder` max-size guard + to tag orders | Delete the hook call and the guard (lines ~536-541). |
| `useStakeInfo()` | `inFight, stake, currentExposure, maxExposureUsed, availableStake, blockedSymbols` → Fight Capital accordion + blocked gating | Delete hook + accordion JSX (~2583-2633) + blocked-symbol amber warning (~3180-3185). |
| `isSymbolBlocked` memo (~106-108) + auto-switch effect (~274-286) | Force symbol off pre-fight positions | Delete both. |
| Submit button disabled clause includes `isSymbolBlocked` + 'Symbol Blocked' label (~3190-3197) | Fight gating | Remove the clause/label. |
| `handlePlaceOrder` passes `fightId`/`leverage` to every create call | Fight tagging | Remove the extras from `createMarketOrder/createLimitOrder/createStandaloneStopOrder/createStopOrder/setPositionTpsl`. |
| `handleClosePosition` 'flip' branch sets `isPreFightFlip` + `fightId` | Avoid recording flips of pre-fight positions | Strip params; flip is otherwise a normal 2× reduce-off market order. |
| `handleMarketChange` preserves `?fight=` URL param (~115-118) | Fight URL state | Remove `?fight=` handling. |
| `displayFightPositions` (raw→Position, `liquidationPrice:0`, no TP/SL) | Fight-only positions | Delete; use `displayPositions`. |
| `activePositions/activeTrades/activeOpenOrders/activeOrderHistory` = `showFightOnly && fightId ? fight... : ...` ternary | Plus the All / Fight Only segmented control (~1828) | Replace with plain `displayPositions/openOrders/tradeHistory/orderHistory`; delete the toggle + `setShowFightOnly`. |
| `fightFilteredPositions`, `fightPnl/fightMargin/fightRoi`, `blockedSymbols` | Fight aggregation | Delete. |
| `<FightBanner/>` (~1110), `<ActiveFightsSwitcher>`, `<BetaGate>` | Fight/beta chrome | Remove from JSX. |
| `<AiBiasWidget tvWidget={tvWidget}>` (~4026) + `useAiBias` | AI layer | Remove; keep `onWidgetReady` generic, drop the `tvWidget` consumer. |
| `MarketSelector blockedSymbols={inFight ? blockedSymbols : []}` (~1136, ~1680) | Fight source into selector | Pass `[]` or drop the prop. |
| Open Orders empty-state 'No open orders during this fight' | Fight string | Change to generic. |

### 2.2 `apps/web/src/hooks/useOrders.ts`

Remove `fightId/leverage/isPreFightFlip` from param interfaces (lines 21-23, 37, 56, 71, 753); remove `fight_id/leverage/is_pre_fight_flip` from POST bodies (130-132, 243, 526, 704, 795); delete `if (variables.fightId)` invalidation blocks (163-179, 812-814). `/api/orders` ignores `leverage` when no `fight_id`.

### 2.3 `apps/web/src/app/api/orders/route.ts`

Remove imports on lines 8-9-10 (`validateStakeLimit, assertSymbolNotBlocked, recordOrderAction, recordAllTrades, emitStakeInfoForUser`); remove `fight_id/leverage/is_pre_fight_flip` destructure (34-36); delete the `assertSymbolNotBlocked` try/catch (50-57) and `validateStakeLimit` try/catch (62-79) — **but note** stake validation currently can block an order, so removing it only *loosens* behavior (safe); delete `recordAllTrades` (173-178), both `recordOrderAction` blocks (181-210), and the `emitStakeInfoForUser` in DELETE (292-294). Keep everything between lines 82-169 (the Pacifica proxy).

### 2.4 Other files

| File | Entanglement | Neutralize |
|---|---|---|
| `lib/store.ts` | `useFightStore`, `useStore` | Delete; keep `useAuthStore`. |
| `lib/api.ts` | `Fight*/Referral*/StakeInfo` types + calls | Split out / delete. |
| `app/providers.tsx` | `GlobalSocketInitializer`, `ReferralTracker` | Remove. |
| `app/layout.tsx` | `GlobalFightVideo` import + element | Remove. |
| `components/MarketSelector.tsx` | `blockedSymbols` prop + `isBlocked` branches | Remove prop and branches. |
| `components/Positions.tsx` | `readOnly/readOnlyMessage` props | Remove. |
| `hooks/useStats.ts` + `app/api/stats/route.ts` | `fightVolume` (fight_trades), `fightsCompleted` (fight count) in same `Promise.all` | Drop those two queries/fields. |
| `lib/server/trade-recording.ts` | FightTrade recording, referral commissions, admin broadcast, realtime emits, `FightStatus` import | Strip to bare Trade insert or remove file. |
| `lib/server/orders.ts` | `validateStakeLimit/assertSymbolNotBlocked` + raw-SQL `tfc_order_actions`/`fightParticipant` | Keep only `getCurrentPrice`. |
| `lib/server/order-actions.ts` | `recordOrderAction` → `TfcOrderAction` (fight-exposure feed) | Remove or no-op. |
| `Skeletons.tsx` | `FightCardSkeleton/ArenaSkeleton/Leaderboard*Skeleton/ProfileSkeleton` | Delete those exports. |
| `components/index.ts` | `FightCard/CancelFightModal/GlobalFightVideo` exports | Delete. |
| `hooks/useGlobalSocket.ts` | arena/admin events + `useStore/useVideoStore/useNavigationStore` + `Admin*Payload` | Strip whole file (re-implement `platform:stats` only if keeping `useStats`). |
| `hooks/useAuth.ts` | `getStoredReferralCode/clearStoredReferralCode` | No-op the referral imports. |

---

## 3. Gaps — what the migrator must supply (NOT in or not portable from this repo)

### 3.1 TradingView charting_library
Licensed proprietary binary. Present at `apps/web/public/charting_library/` but **you must obtain your own** under TradingView's license. Plus the `window.TradingView` ambient `.d.ts` (not in repo). The datafeed (`lib/tradingview/`) and `TradingViewChartAdvanced.tsx` are portable; the binary is not.

### 3.2 Backend / DB
- **Prisma schema bits:** minimal models `User` and `PacificaConnection` (userId ↔ accountAddress map; both auth and the account service depend on it). Schema content is **out of scope** in the docs (`packages/db/prisma/schema.prisma`) — define your own. Drop all fight/referral/prize tables and `FightStatus`/`settlement-lock`.
- **Auth/session:** JWT (`JWT_SECRET`) in `lib/server/auth.ts`; `POST /auth/connect` and `GET /api/auth/pacifica/me`. `withAuth` gates on `User.status` — slim for terminal.
- **Redis:** optional (`cached-adapter.ts`, `ioredis`); `REDIS_URL` commented out in current `.env`. Terminal works without it.
- **Realtime server (`apps/realtime`):** STRIP entirely; only needed for fights. The `platform:stats` event is the only terminal-relevant emit if you keep `useStats`.
- `FeatureFlags.isTradingEnabled()` — supply or stub (defaults to enabled).

### 3.3 Solana / Pacifica account setup
- **Solana RPC:** `NEXT_PUBLIC_SOLANA_RPC_URL` / `SOLANA_RPC_URL` / `NEXT_PUBLIC_SOLANA_NETWORK` (verify exact names in `WalletProvider.tsx`; docs disagree — some say `NEXT_PUBLIC_SOLANA_RPC`, some `NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL`). The deposit/balance path needs a real mainnet RPC.
- **Pacifica on-chain constants** (deposits, mainnet): program `PCFA5iYgmqK6MqPhWNKg7Yv7auX7VZ4Cx7T1eJyrAMH`, vault `72R843XwZxqWhsJceARQQTTbYtWy6Zw9et2YV4FpRHTa`, central state `9Gdmhq4Gv1LnNMp7aiS1HSVd7pNnXNMsbuXALCQRmGjY`, USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. (Hard-coded in deposit code; verify before mainnet use.)
- **Pacifica account/agent-wallet:** Pacifica is **client-signed** (Solana wallet), so no server agent-wallet key vault is needed for orders. The `EXCHANGE_KEY_ENCRYPTION_SECRET`/secrets-provider machinery is only for the other exchanges (HL/Lighter) — drop for Pacifica-only.
- **Builder code:** `NEXT_PUBLIC_PACIFICA_BUILDER_CODE` (default `TradeClub`), `TRADECLUB_FEE = 0.0005`. Verify your own builder-code authorization flow (`useBuilderCode`).

### 3.4 Env vars to set (terminal-only subset)
Client: `NEXT_PUBLIC_PACIFICA_API_URL`, `NEXT_PUBLIC_PACIFICA_WS_URL`, `NEXT_PUBLIC_PACIFICA_BUILDER_CODE`, `NEXT_PUBLIC_SOLANA_NETWORK`, `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, (optional) `NEXT_PUBLIC_API_URL`.
Server: `PACIFICA_API_URL`, `PACIFICA_BUILDER_CODE`, (optional) `PACIFICA_API_KEY`, `USE_EXCHANGE_ADAPTER`, `JWT_SECRET`, `DATABASE_URL`/`DIRECT_URL`, (optional) `REDIS_URL`, `SOLANA_RPC_URL`.
**Drop (fights/ops):** `NEXT_PUBLIC_WS_URL`, `REALTIME_*`, `ADMIN_*`, `ANTI_CHEAT_*`, `REFERRAL_*`, `TREASURY_*` (keep only if porting deposits), `INTERNAL_API_SECRET`, `ANTHROPIC_API_KEY`, Sentry, leaderboard/stale-fight/reconciliation intervals.

### 3.5 Design-system pieces not in the CSS files
- Tailwind-default color families (orange/amber/violet/zinc/red/green) must be present (stock Tailwind, not redefined in config).
- `shimmer` keyframe + animation must be added to `tailwind.config.ts` or skeletons render static.
- Purple glow `#8b5cf6` (in `shadow-glow-accent`) is referenced but not in the palette — define it.
- Decide ONE font mechanism: `next/font` (Inter + JetBrains Mono) vs the Google `@import` in `globals.css` (Inter + Roboto Mono) — the repo ships **both**; remove the unused one.
- Where `<Toaster/>` is mounted (layout) and the `.wallet-compact` wrapper class (applied by Header) live outside the CSS — wire them.

---

## 4. Recommended minimal fresh-repo structure

A single Next.js 14 app (no monorepo needed once `@tfc/db`/`@tfc/shared` are inlined):

```
trading-terminal/
  next.config.mjs              # serverComponentsExternalPackages:[prisma], output:standalone, coingecko remotePatterns
  postcss.config.mjs
  tailwind.config.ts           # surface-*/win-*/loss-*/primary-* ; shimmer keyframe ; #8b5cf6
  tsconfig.json                # @/* -> ./src/* , strictNullChecks
  prisma/schema.prisma         # User + PacificaConnection only
  public/
    charting_library/          # SUPPLY (licensed)
    tradingview-custom.css
    images/logos/              # favicons + chart watermark
  src/
    app/
      layout.tsx               # fonts, globals.css, Providers, Toaster (no GlobalFightVideo)
      providers.tsx            # QueryClientProvider + WalletProvider (no GlobalSocket/ReferralTracker)
      globals.css              # tokens, .card, .select chevron, scrollbars (no badge-*/VS-arena)
      trade/page.tsx           # de-fought terminal page
      api/
        orders/{route.ts,[orderId],edit,batch,stop}/
        positions/tpsl/
        account/{summary,positions,orders,leverage,margin,withdraw}/
        markets/{route,prices,[symbol]}/
        chart/candles/
        auth/{connect,pacifica/me}/
        builder-code/  fees/
    components/
      AppShell.tsx Header.tsx WalletProvider.tsx WalletButton.tsx
      MarketSelector.tsx OrderBook.tsx Positions.tsx TradesHistoryTable.tsx
      TradingViewChartAdvanced.tsx PacificaChart.tsx
      TpSlModal.tsx EditOrderModal.tsx MarketCloseModal.tsx LimitCloseModal.tsx
      FlipPositionModal.tsx CloseOppositeModal.tsx QuickPositionModal.tsx
      QuickPositionsBar.tsx SettingsModal.tsx NoPacificaModal.tsx WithdrawModal.tsx
      deposit/DepositModal.tsx
      PacificaWebSocketInit.tsx PacificaConnectionSync.tsx TokenIcon.tsx
      ui/ { Dropdown Slider Toggle Portal Spinner Skeletons }
    hooks/
      useAuth useAccount usePositions usePrices useOrderBook useCandles useKlineData
      usePacificaWebSocket usePacificaConnection useOrders useBuilderCode
      useDeposit useUsdcBalance useSettings useUrlState
      useTradeHistory useOrderHistory useUserTrades
    lib/
      api.ts queryClient.ts store.ts formatters.ts constants.ts notify.ts
      trading/utils.ts
      pacifica/{api-client,signing,deposit-instruction}.ts
      tradingview/{index,PacificaDatafeed,WebSocketManager}.ts
      server/{auth,db,errors,error-codes,logger,feature-flags,pacifica,pacifica-signing}.ts
      server/exchanges/{adapter,pacifica-adapter,cached-adapter,provider}.ts
      server/services/account.ts
```

---

## 5. Recommended integration order

1. **Scaffold + design system.** Next 14 app, `tsconfig` (`@/*` alias), `tailwind.config.ts` (tokens + shimmer + #8b5cf6), `postcss.config.mjs`, `globals.css` (de-fought), fonts (pick one mechanism), `<Toaster>`. → [02](./02-design-tokens-css.md), [03](./03-tailwind-fonts-theme.md).
2. **UI primitives.** `Dropdown, Slider, Toggle, Portal, Spinner, Skeletons` (fight skeletons removed). → [10](./10-ui-primitives.md).
3. **Constants + formatters + lib/api types.** Inline `@tfc/shared` order constants; port `formatters.ts`; trim `lib/api.ts` types. → [01](./01-overview-architecture.md), [19](./19-dependencies-env-setup.md).
4. **Wallet + auth.** `WalletProvider/WalletButton`, `useAuthStore`, `useAuth` (referral no-op), `providers.tsx` (no fight socket). Stand up `POST /auth/connect`, `GET /api/auth/pacifica/me`, Prisma `User`+`PacificaConnection`. → [14](./14-account-trading-hooks.md), [17](./17-api-routes.md).
5. **Pacifica integration + signing.** `lib/pacifica/{api-client,signing,deposit-instruction}`, server `pacifica.ts`/`pacifica-signing.ts`, exchange adapters/provider. → [16](./16-pacifica-integration.md), [18](./18-server-adapter.md).
6. **Market-data hooks + WS.** `usePrices, useOrderBook, usePacificaWebSocket, useCandles/useKlineData`, `PacificaWebSocketInit/PacificaConnectionSync`. Wire `/api/markets*`, `/api/chart/candles`. → [13](./13-market-data-hooks.md), [15](./15-websocket-realtime.md).
7. **Charts.** Drop in licensed `charting_library`, `lib/tradingview/*`, `TradingViewChartAdvanced` (generic `onWidgetReady`, no AI consumer); plus `PacificaChart` fallback. → [11](./11-tradingview-chart.md), [12](./12-pacifica-lightweight-chart.md).
8. **Account/order hooks + proxy routes.** `useAccount, usePositions, useOrders` (fight params stripped), `/api/orders` (de-fought), `/api/account/*`, `/api/positions/tpsl`, `useBuilderCode`. → [05](./05-order-entry-form.md), [07](./07-positions-orders.md), [14](./14-account-trading-hooks.md).
9. **Panels.** `MarketSelector` (no `blockedSymbols`), `OrderBook` (wire `onPriceClick`), `Positions` (no `readOnly`), `TradesHistoryTable`, modals. → [04](./04-page-layout.md), [06](./06-orderbook.md), [07](./07-positions-orders.md), [08](./08-market-selector.md), [09](./09-modals.md).
10. **Page assembly.** Rebuild `trade/page.tsx` from the de-fought layout in §2.1; add `deposit/DepositModal`, `WithdrawModal`. → [04](./04-page-layout.md).

---

## 6. Definition of Done — smoke test

- [ ] App builds (`next build`) with no `@tfc/db`/`@tfc/shared`/fight imports remaining (grep `Fight|fight_id|stake|arena|aiBias` → zero terminal hits).
- [ ] Wallet connects; auth token issued; `pacifica/me` returns `{connected:true}` for a linked account.
- [ ] `MarketSelector` lists markets from Pacifica `/api/v1/info`; switching symbol updates chart/orderbook/order-entry. No "Blocked" badge appears.
- [ ] TradingView chart renders with live candles (WS) and historical backfill; no console errors about missing `charting_library`.
- [ ] `OrderBook` streams from `wss://ws.pacifica.fi/ws` and updates in real time; clicking a level fills the price input (after you wire `onPriceClick`).
- [ ] Live mark/oracle/funding via `usePrices`; positions/orders/fills stream via `usePacificaWebSocket`.
- [ ] **Place a market order** end-to-end: client signs → `POST /api/orders` → Pacifica fills → position appears. No `validateStakeLimit`/`StakeLimitError` path triggers (it's removed).
- [ ] Place + cancel a **limit order**; edit a limit order (`/api/orders/edit`).
- [ ] Set **TP/SL** on a position; close via **MarketClose/LimitClose**; **flip** a position (2× reduce-off market) with no fight params in the payload.
- [ ] Set **leverage** and **margin mode**; values persist.
- [ ] **Deposit** USDC (mainnet RPC + Pacifica program constants) and **withdraw** complete.
- [ ] Toasts fire on success/error (sonner); no `<GlobalFightVideo>`, fight banner, AI widget, or "Fight Only" toggle anywhere in the DOM.
- [ ] No socket.io connection attempts to `:3002` in the network tab (fight realtime fully removed).

---

### Cross-links
[01 Overview](./01-overview-architecture.md) · [02 Design tokens](./02-design-tokens-css.md) · [03 Tailwind/fonts](./03-tailwind-fonts-theme.md) · [04 Page layout](./04-page-layout.md) · [05 Order entry](./05-order-entry-form.md) · [06 Orderbook](./06-orderbook.md) · [07 Positions/orders](./07-positions-orders.md) · [08 Market selector](./08-market-selector.md) · [09 Modals](./09-modals.md) · [10 UI primitives](./10-ui-primitives.md) · [11 TradingView chart](./11-tradingview-chart.md) · [12 lightweight-charts](./12-pacifica-lightweight-chart.md) · [13 Market-data hooks](./13-market-data-hooks.md) · [14 Account/trading hooks](./14-account-trading-hooks.md) · [15 WebSocket/realtime](./15-websocket-realtime.md) · [16 Pacifica integration](./16-pacifica-integration.md) · [17 API routes](./17-api-routes.md) · [18 Server adapter](./18-server-adapter.md) · [19 Dependencies/env](./19-dependencies-env-setup.md)
