# Account & Trading Hooks

Part of the Trading Terminal Migration set — see [README](./README.md).

This doc covers the React hooks under `apps/web/src/hooks/` that power the trading terminal's **account data, order placement/management, market data reads, deposits, USDC balance, builder-code authorization, settings, and wallet auth**. All hooks are client-side (`'use client'`) and assume a Solana wallet via `@solana/wallet-adapter-react` and TanStack Query (`@tanstack/react-query`).

> Sibling docs: signing layer (`@/lib/pacifica/signing`), the Pacifica REST client (`@/lib/pacifica/api-client`), the `/api/*` proxy routes, the Pacifica WebSocket store ([15-websocket-realtime](./15-websocket-realtime.md)), and positions/orders UI ([07-positions-orders](./07-positions-orders.md)).

---

## 0. Conventions shared by all hooks

| Concept | Value |
|---|---|
| Query client | TanStack Query v5 (`useQuery`, `useMutation`, `useInfiniteQuery`, `useQueryClient`) |
| Wallet | `useWallet()` from `@solana/wallet-adapter-react`; account id = `wallet.publicKey.toBase58()` (Solana base58 pubkey) |
| Signing | Client-side `createSigned*` fns from `@/lib/pacifica/signing` sign with the wallet, return `{ signature, timestamp }` |
| Backend | Mutations POST to Next.js proxy routes under `/api/*` (which forward to Pacifica). Reads hit Pacifica **directly** via `@/lib/pacifica/api-client`. |
| Side identifiers | Pacifica `bid` = LONG, `ask` = SHORT. Terminal types use `'LONG' | 'SHORT'`. |
| Symbols | Pacifica uses bare symbols (`BTC`); terminal types use `BTC-USD`. Hooks `.replace('-USD','')` before sending; append `-USD` when transforming responses. |
| Notifications | `notify(category, title, body, { variant })` from `@/lib/notify` (orders/account). `useBuilderCode` uses `toast` from `sonner`. |
| Builder code | `const BUILDER_CODE = process.env.NEXT_PUBLIC_PACIFICA_BUILDER_CODE || 'TradeClub'` |

---

## 1. Summary table

| Hook | File | Kind | Query key(s) / mutation | Endpoint(s) | Side effects |
|---|---|---|---|---|---|
| `useAccount` | `useAccount.ts` | composite (memo) | reuses `account`,`positions`,`orders`,`account-settings` | none of its own | derives `AccountSummary`, `Position[]`, `OpenOrder[]` |
| `usePositions` | `usePositions.ts` | query | `['positions', addr]` | `PacificaAPI.getPositions` | WS-preferred merge |
| `useAccountInfo` | `usePositions.ts` | query | `['account', addr]` | `PacificaAPI.getAccountInfo` | poll 15s |
| `useAccountSettings` | `usePositions.ts` | query | `['account-settings', addr]` | `PacificaAPI.getAccountSettings` | poll 30s |
| `useOpenOrders` | `usePositions.ts` | query | `['orders', addr, symbol?]` | `PacificaAPI.getOpenOrders` | WS+HTTP merge |
| `useMarkets` / `useMarket` | `usePositions.ts` | query | `['markets']` | `PacificaAPI.getMarkets` | cache 60s |
| `useTradeHistory` | `usePositions.ts` | infinite query | `['trade-history', addr, symbol?]` | `PacificaAPI.getTradeHistory` | cursor paging, WS merge |
| `useOrderHistory` | `usePositions.ts` | query | `['order-history', addr, symbol?]` | `PacificaAPI.getOrderHistory` | poll 30s |
| `useCreateMarketOrder` | `useOrders.ts` | mutation | — | `POST /api/orders` | invalidate positions/orders/account (+fight) |
| `useCreateLimitOrder` | `useOrders.ts` | mutation | — | `POST /api/orders` | invalidate orders |
| `useCancelOrder` | `useOrders.ts` | mutation | — | `DELETE /api/orders/:id` | invalidate orders |
| `useCancelStopOrder` | `useOrders.ts` | mutation | — | `POST /api/orders/stop/cancel` | invalidate orders/positions |
| `useCancelAllOrders` | `useOrders.ts` | mutation | — | `DELETE /api/orders` | invalidate orders |
| `useSetPositionTpSl` | `useOrders.ts` | mutation | — | `POST /api/positions/tpsl` | refetch orders/positions |
| `useCreateStopOrder` | `useOrders.ts` | mutation | — | `POST /api/orders` (TP) or `/api/orders/stop/create` (SL) | refetch orders/positions |
| `useCreateStandaloneStopOrder` | `useOrders.ts` | mutation | — | `POST /api/orders/stop/create` | invalidate orders/positions/account |
| `useSetLeverage` | `useOrders.ts` | mutation | — | `POST /api/account/leverage` | invalidate account-settings |
| `useSetMarginMode` | `useOrders.ts` | mutation | — | `POST /api/account/margin` | invalidate account-settings |
| `useEditOrder` | `useOrders.ts` | mutation | — | `POST /api/orders/edit` | invalidate orders |
| `useBatchOrders` | `useOrders.ts` | mutation | — | `POST /api/orders/batch` | invalidate orders/positions/account |
| `useWithdraw` | `useOrders.ts` | mutation | — | `POST /api/account/withdraw` | invalidate account, pacifica-account |
| `useUserTrades` | `useUserTrades.ts` | useState/fetch | — | `GET /api/users/:userId/trades?limit=1000` | local state |
| `useStakeInfo` | `useStakeInfo.ts` | query + socket.io | `['stake-info', addr, fightId]` | `GET /fights/stake-info` via `api.getStakeInfo` | **FIGHT — strip** |
| `useUsdcBalance` | `useUsdcBalance.ts` | useState/RPC | — | Solana RPC `getTokenAccountBalance` | reads on-chain USDC |
| `useDeposit` | `useDeposit.ts` | useState/RPC | — | Solana RPC `sendTransaction` | on-chain Pacifica deposit |
| `useSettings` | `useSettings.ts` | useState/localStorage | — | `localStorage['tfc-settings']` | listens `tfc-settings-changed` |
| `useBuilderCodeStatus` | `useBuilderCode.ts` | query | `['builder-code', addr]` | `GET /api/builder-code?account=` | cache 60s |
| `useApproveBuilderCode` | `useBuilderCode.ts` | mutation | — | `POST /api/builder-code` | invalidate builder-code; toast |
| `useAuth` | `useAuth.ts` | composite | invalidates `pacifica-connection` | `api.connectWallet` -> `POST /auth/connect` | Zustand auth store, query cache clears |

---

## 2. `useAccount` — unified account summary (`useAccount.ts`)

Composite hook (no fetch of its own). Calls `useAccountInfo`, `usePositions`, `useOpenOrders`, `useAccountSettings` and `useMemo`-transforms into terminal-shaped types.

```ts
function useAccount(): {
  account: AccountSummary | null;
  positions: Position[];     // from @/lib/api
  openOrders: OpenOrder[];   // from @/lib/api
  isLoading: boolean;
  error: string | null;      // always null here
  refetch: () => Promise<void>;  // = refetchAccount
}
```

### `AccountSummary` (exported interface)

```ts
export interface AccountSummary {
  balance: string;
  equity: string;
  accountEquity: string;     // duplicate of equity for component compat
  unrealizedPnl: string;     // computed: accountEquity - balance
  marginUsed: string;
  availableBalance: string;
  totalMarginUsed: string;
  availableToSpend: string;
  availableToWithdraw: string;
  feeLevel?: number;
  crossMmr?: string;
  makerFee?: string;         // e.g. "0.000575"
  takerFee?: string;         // e.g. "0.0007"
}
```

Transforms to reproduce:
- **Unrealized PnL is computed**, not returned: `unrealizedPnl = parseFloat(account_equity) - parseFloat(balance)`. Pacifica REST does not return it.
- Field-name tolerance: `account_equity || equity`, `available_to_spend || available_balance`, `total_margin_used || margin_used`.
- **Position leverage** comes from `account-settings` (`{symbol, leverage}[]` -> map), falling back to a hardcoded `MAX_LEVERAGE` table, else `10`. Reproduce verbatim:

```ts
const MAX_LEVERAGE: Record<string, number> = {
  BTC: 50, ETH: 50, SOL: 20, HYPE: 20, XRP: 20, DOGE: 20, LINK: 20, AVAX: 20,
  SUI: 10, BNB: 10, AAVE: 10, ARB: 10, OP: 10, APT: 10, INJ: 10, TIA: 10,
  SEI: 10, WIF: 10, JUP: 10, PENDLE: 10, RENDER: 10, FET: 10, ZEC: 10,
  PAXG: 10, ENA: 10, KPEPE: 10,
};
```

- **Position mapping**: `side = pos.side==='bid' ? 'LONG' : 'SHORT'`; `markPrice` defaults to `entry_price` (REST has no mark price — trade page injects live price); `unrealizedPnl`/`unrealizedPnlPercent` default `'0'`. REST does NOT return `mark_price`, `liquidation_price`, `unrealized_pnl`, or `leverage`.
- **Open-order mapping**: maps `order_type` to display string (`LIMIT`, `MARKET`, `TP MARKET`, `SL MARKET`, `TP LIMIT`, `SL LIMIT`). For TP/SL orders with size `0`, back-fills size from the matching position (same symbol, opposite side). Display price for TP/SL uses `stop_price`.

`Position` / `OpenOrder` type shapes (from `@/lib/api`):

```ts
export interface Position {
  symbol: string; side: 'LONG' | 'SHORT'; size: string;
  entryPrice: string; markPrice: string; liquidationPrice: string;
  leverage: number; margin: string; unrealizedPnl: string;
  unrealizedPnlPercent: string; funding?: string; isolated?: boolean;
}
export interface OpenOrder {
  id: string; symbol: string; side: 'LONG' | 'SHORT'; type: string;
  size: string; price: string; filled: string; status: string;
  reduceOnly?: boolean; stopPrice?: string | null; createdAt: number;
}
```

---

## 3. Read hooks (`usePositions.ts`)

All reads call `@/lib/pacifica/api-client` (`PacificaAPI.*`) directly against Pacifica, gated on `enabled: connected && !!publicKey`. They blend in real-time data from `usePacificaWsStore` (selectors: `isConnected`, `positions`, `orders`, `trades`).

| Hook | Key | API call | refetchInterval | staleTime |
|---|---|---|---|---|
| `usePositions()` | `['positions', addr]` | `getPositions(account)` -> `response.data` (array) | WS 30s / HTTP 15s | WS 20s / 10s |
| `useAccountInfo()` | `['account', addr]` | `getAccountInfo(account)` -> `response.data` | 15s | 10s |
| `useAccountSettings()` | `['account-settings', addr]` | `getAccountSettings(account)` | 30s | 20s |
| `useOpenOrders(symbol?)` | `['orders', addr, symbol]` | `getOpenOrders(account, symbol)` | WS 30s / 15s | WS 20s / 10s |
| `useMarkets()` | `['markets']` | `getMarkets()` -> `data.markets` | 60s | 60s |
| `useMarket(symbol)` | derives from `useMarkets` | — | — | — |
| `useTradeHistory(symbol?)` | `['trade-history', addr, symbol]` | `getTradeHistory(account, {symbol, limit:50, cursor})` | WS 30s / 15s | WS 20s / 10s |
| `useOrderHistory(symbol?)` | `['order-history', addr, symbol]` | `getOrderHistory(account, {symbol, limit:50})` | 30s | 20s |

Behavior to preserve:
- **Pacifica REST envelope**: `{ success, data, error, code }`. `data` for positions/orders is *directly an array* (not `data.positions`). Hooks guard with `Array.isArray(response.data) ? response.data : []`.
- **`usePositions`**: if WS connected and `wsPositions.length > 0`, returns WS data mapped to `{symbol, side, amount, entry_price, margin, funding, isolated, liq_price, updated_at}` with `isLoading:false`. WS provides `liq_price` (REST does not).
- **`useOpenOrders`**: when WS connected, bidirectionally merges WS orders (by `order_id`) with HTTP orders so newly created orders (not yet in WS) still show; prefers WS `stop_price`, falls back to HTTP. Returns merged list with `isLoading:false`.
- **`useTradeHistory`**: `useInfiniteQuery`, cursor paging. `queryFn({pageParam})` returns `{trades, nextCursor: response.next_cursor, hasMore: response.has_more}`; `getNextPageParam = lastPage.hasMore ? lastPage.nextCursor : undefined`. Flattens `data.pages`; if WS has trades, merges by `history_id`, sorts `created_at` desc. Returns custom object `{ data, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, refetch }`.

Retry config on user-data queries: `retry: 1`, `retryDelay: 2000–3000`. Intervals raised deliberately to avoid Pacifica 429 rate limits.

---

## 4. Order mutation hooks (`useOrders.ts`)

Pattern: check wallet connected -> `account = wallet.publicKey.toBase58()` -> sign with the matching `createSigned*` -> POST/DELETE to a `/api/*` proxy -> on non-OK throw `error.error || HTTP {status}` -> return `result.data`. onSuccess: invalidate/refetch + `notify`. onError: `console.error` + error `notify`.

### Param interfaces

```ts
interface CreateMarketOrderParams {
  symbol: string; side: 'bid' | 'ask'; amount: string;
  reduceOnly?: boolean; slippage_percent?: string; builder_code?: string;
  take_profit?: { stop_price: string }; stop_loss?: { stop_price: string };
  fightId?: string;          // FIGHT — strip
  leverage?: number;         // FIGHT (FightTrade ROI) — strip
  isPreFightFlip?: boolean;  // FIGHT — strip
}
interface CreateLimitOrderParams {
  symbol: string; side: 'bid' | 'ask'; price: string; amount: string;
  reduceOnly?: boolean; postOnly?: boolean; tif?: 'GTC'|'IOC'|'ALO'|'TOB';
  builder_code?: string;
  take_profit?: { stop_price: string }; stop_loss?: { stop_price: string };
  fightId?: string; leverage?: number;          // FIGHT — strip
}
interface CancelOrderParams { orderId: number; symbol: string; }
interface CancelAllOrdersParams { symbol?: string; }
interface SetPositionTpSlParams {
  symbol: string; side: 'LONG'|'SHORT'; size: string;
  take_profit?: { stop_price: string; limit_price?: string } | null; // null = remove
  stop_loss?:   { stop_price: string; limit_price?: string } | null; // null = remove
  fightId?: string;                              // FIGHT — strip
}
interface SetLeverageParams { symbol: string; leverage: number; }
interface CreateStopOrderParams {
  symbol: string; side: 'LONG'|'SHORT'; stopPrice: string; amount: string;
  limitPrice?: string; type: 'TAKE_PROFIT'|'STOP_LOSS'; fightId?: string; // FIGHT
}
interface CreateStandaloneStopOrderParams {
  symbol: string; side: 'bid'|'ask'; stopPrice: string; amount: string;
  limitPrice?: string; reduceOnly?: boolean; fightId?: string; leverage?: number; // FIGHT
}
interface EditOrderParams { orderId: number; symbol: string; price: string; amount: string; }
interface WithdrawParams { amount: string; }
```

### `useCreateMarketOrder()`
- Sign: `createSignedMarketOrder(wallet, { symbol, side, amount, slippage_percent, reduce_only, builder_code, take_profit, stop_loss })`. Default `slippage_percent='0.5'`, `builder_code=BUILDER_CODE`.
- `POST /api/orders` body: `{ account, symbol, side, type:'MARKET', amount, reduce_only, slippage_percent, builder_code, take_profit, stop_loss, signature, timestamp, fight_id, leverage, is_pre_fight_flip }`.
- onSuccess: invalidate `['positions']`,`['orders']`,`['account']`. If TP/SL present, re-invalidate `['orders']` at +1000ms and +2500ms (Pacifica creates stop orders asynchronously). **FIGHT block**: if `variables.fightId`, invalidate `['fight-positions', id]`, `['fight-trades', id]`, `['fight-orders', id]`, `['stake-info']` at +1000ms and +3000ms.
- Toast: `notify('TRADE','Order Filled','{amount} {symbol} filled at {avg_price}', {variant:'success'})`.

### `useCreateLimitOrder()`
- Sign: `createSignedLimitOrder(wallet, { symbol, side, price, amount, reduce_only, builder_code, tif, take_profit, stop_loss })`. `tif` default `'GTC'`. `post_only` is NOT a valid Pacifica limit param (sent in body, not signed).
- `POST /api/orders` body adds `type:'LIMIT', price, post_only, tif, fight_id, leverage`.
- onSuccess: invalidate `['orders']` (+ delayed re-invalidate if TP/SL). Toast `notify('ORDER','Limit Order', ...)`.

### `useCancelOrder()`
- Sign: `createSignedCancelOrder(wallet, { order_id, symbol })`.
- `DELETE /api/orders/{orderId}?account=&symbol=&signature=&timestamp=` (query string, no body).
- onSuccess: invalidate `['orders']`; toast `Order #{id} cancelled`.

### `useCancelStopOrder()`
- Sign: `createSignedCancelStopOrder(wallet, { order_id, symbol })`.
- `POST /api/orders/stop/cancel` body `{ account, symbol, order_id, signature, timestamp }`.
- onSuccess: invalidate `['orders']`+`['positions']` immediately, then both at +500ms and `['orders']` at +1500ms.

### `useCancelAllOrders()`
- Sign: `createSignedCancelAllOrders(wallet, { all_symbols: !symbol, exclude_reduce_only:false, symbol })`.
- `DELETE /api/orders?account=&signature=&timestamp=[&symbol=]` (URL built via `new URL(..., window.location.origin)`).
- onSuccess: invalidate `['orders']`.

### `useSetPositionTpSl()`
- Converts position side to **closing** order side: `side = params.side==='LONG' ? 'ask' : 'bid'`. Symbol `.replace('-USD','')`.
- `null` = remove the TP or SL; `undefined` = leave unchanged; object = set. Request body built to **exactly match** the signed data. `size` is NOT in the signed data (Pacifica `set_position_tpsl` doesn't support it in signature verification) — sent only in the request body.
- Sign: `createSignedSetPositionTpsl(wallet, signParams)`.
- `POST /api/positions/tpsl` body `{ account, symbol, side, signature, timestamp, fight_id, size?, take_profit?, stop_loss? }`. **`builder_code` is NOT a valid field here.**
- onSuccess: `refetchQueries({queryKey:['orders'], type:'active'})` (and positions) immediately, then at +300ms and +800ms (refetch, not just invalidate, to surface TP/SL faster).

### `useCreateStopOrder()` (TP/SL on an existing position, partial)
- Closing side: `LONG -> ask`, `SHORT -> bid`. Symbol `.replace('-USD','')`.
- **TAKE_PROFIT path**: signed as a limit order with `reduce_only:true` (`createSignedLimitOrder`) -> `POST /api/orders` (`type:'LIMIT', tif:'GTC', reduce_only:true`). Pacifica stop orders only trigger when price moves against you, so TP uses a reduce-only limit instead.
- **STOP_LOSS path**: `createSignedStopOrder(wallet, { symbol, side, reduce_only:true, stop_order:{ stop_price, amount, limit_price? } })` -> `POST /api/orders/stop/create` body `{ account, ...stopOrderParams, signature, timestamp, fight_id }`.
- onSuccess: `refetchQueries(['orders']/['positions'], active)` immediately + at +300/+800ms.

### `useCreateStandaloneStopOrder()` (new stop-market / stop-limit entry from order form)
- Sign: `createSignedStopOrder(wallet, { symbol, side, reduce_only, stop_order:{ stop_price, amount, limit_price? } })`.
- `POST /api/orders/stop/create` body `{ account, ...stopOrderParams, signature, timestamp, fight_id }`.
- onSuccess: invalidate `['orders']`,`['positions']`,`['account']`. **FIGHT block**: if `fightId`, invalidate `['fight-orders', id]` + `['stake-info']` at +1000ms.

### `useSetLeverage()`
- Sign: `createSignedUpdateLeverage(wallet, { symbol, leverage: String(n) })`. Symbol `.replace('-USD','')`.
- `POST /api/account/leverage` body `{ account, symbol, leverage, signature, timestamp }`.
- onSuccess: invalidate `['account-settings']`. onError special-case `InvalidLeverage` -> "Cannot decrease leverage while position is open".

### `useSetMarginMode()`
- Param `{ symbol, isIsolated }`. Sign: `createSignedUpdateMarginMode(wallet, { symbol, is_isolated })`.
- `POST /api/account/margin` body `{ account, symbol, is_isolated, signature, timestamp }`.
- onSuccess: invalidate `['account-settings']`. onError special-case open position -> "Close position first to change margin mode".

### `useEditOrder()` (cancels + recreates with TIF=ALO)
- Sign: `createSignedEditOrder(wallet, { symbol, price, amount, order_id })`.
- `POST /api/orders/edit` body `{ account, symbol, price, amount, order_id, signature, timestamp }`.
- onSuccess: invalidate `['orders']`.

### `useBatchOrders()` (no wallet in hook — actions pre-signed by caller)
- Validates `1..10` actions. `POST /api/orders/batch` body `{ actions }`.

```ts
export interface BatchCreateAction { type:'Create'; data:{ account; signature; timestamp; expiry_window; symbol; price; amount; side:'bid'|'ask'; tif; reduce_only; builder_code?; client_order_id? } }
export interface BatchCancelAction { type:'Cancel'; data:{ account; signature; timestamp; expiry_window; symbol; order_id } }
export type BatchAction = BatchCreateAction | BatchCancelAction;
// response: { results: { success: boolean; order_id?: number; error?: string|null }[] }
```
- onSuccess: invalidate `['orders']`,`['positions']`,`['account']`; toast success/partial counts.

### `useWithdraw()`
- Sign: `createSignedWithdraw(wallet, { amount })`.
- `POST /api/account/withdraw` body `{ account, amount, signature, timestamp }`.
- onSuccess: invalidate `['account']` and `['pacifica-account']`.

---

## 5. `useUserTrades(userId)` (`useUserTrades.ts`)

Plain `useState`/`useEffect` fetch (not TanStack). Reads the app's own backend, not Pacifica.

```ts
function useUserTrades(userId: string): { trades: Trade[]; loading: boolean; error: string | null }
export interface Trade {
  id: string; symbol: string; side: string;     // BUY | SELL
  position: string;  // open_long | open_short | close_long | close_short
  amount: string; price: string; fee: string;
  pnl: string | null; leverage: number | null; executedAt: string;
}
```
- `GET /api/users/{userId}/trades?limit=1000`. Expects `{ success, data: { trades }, error }`. Refetches when `userId` changes.

---

## 6. `useStakeInfo()` (`useStakeInfo.ts`) — FIGHT-ONLY, STRIP ON MIGRATION

Purely the duel/fight capital-limit feature. No terminal value; remove entirely. Documented only so the migrator knows what to delete and what it touches.

- Query: `['stake-info', addr, fightId]` -> `api.getStakeInfo(account, fightId)` -> `GET /fights/stake-info?account=&fightId=`.
- `fightId` from URL `?fight=` (`useSearchParams`).
- Opens a **socket.io** connection to `NEXT_PUBLIC_WS_URL || 'http://localhost:3002'` with `auth:{ token }` (token from `useAuthStore`), emits `join_fight`/`leave_fight`, listens for `STAKE_INFO`, invalidates `['stake-info']`.
- Returns `{ stakeInfo, inFight, fightId, stake, currentExposure, maxExposureUsed, available, blockedSymbols, isLoading, error, refetch }` (`StakeInfo` from `@/lib/api`).

**Migration action:** delete this file and every import of `useStakeInfo`. Also delete the `['stake-info']` invalidations in `useOrders.ts` (`useCreateMarketOrder`, `useCreateStandaloneStopOrder`).

---

## 7. `useUsdcBalance()` (`useUsdcBalance.ts`)

Reads the wallet's **mainnet** USDC balance directly from Solana RPC. Independent of Pacifica/backend.

```ts
function useUsdcBalance(): { balance: number | null; isLoading: boolean; error: string | null; refresh: () => Promise<void> }
```
- RPC: `new Connection(MAINNET_RPC_URL, 'confirmed')` where `MAINNET_RPC_URL = NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL || NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'`.
- Derives the USDC ATA via `getAssociatedTokenAddressSync(USDC_MINT, publicKey, false)` and calls `getTokenAccountBalance`. If the ATA doesn't exist, treats balance as `0`.
- Uses a dedicated mainnet `Connection` (not `useConnection()`) because the wallet provider may be on devnet during dev. Re-exports `USDC_DECIMALS`.

---

## 8. `useDeposit()` (`useDeposit.ts`)

Fully client-side USDC deposit into Pacifica's on-chain vault. No backend call.

```ts
type DepositStatus = 'idle' | 'signing' | 'confirming' | 'success' | 'error';
function useDeposit(): { deposit: (uiAmount: number) => Promise<void>; status: DepositStatus; txSignature: string | null; error: string | null; reset: () => void }
```
- Validates `uiAmount >= MIN_DEPOSIT_USDC` (10).
- Builds `buildDepositInstruction(wallet.publicKey, uiAmount)` and a `Transaction` with `ComputeBudgetProgram.setComputeUnitLimit({units:300_000})` + `setComputeUnitPrice({microLamports:10_000})` (priority fee against congestion).
- `wallet.sendTransaction(tx, connection, { skipPreflight:false, preflightCommitment:'confirmed' })` then `confirmTransaction`. Sets `status` through `signing -> confirming -> success|error`.

### `@/lib/pacifica/deposit-instruction.ts` constants (mainnet, copy verbatim)

```ts
export const PACIFICA_PROGRAM_ID    = new PublicKey('PCFA5iYgmqK6MqPhWNKg7Yv7auX7VZ4Cx7T1eJyrAMH');
export const PACIFICA_CENTRAL_STATE = new PublicKey('9Gdmhq4Gv1LnNMp7aiS1HSVd7pNnXNMsbuXALCQRmGjY');
export const PACIFICA_VAULT         = new PublicKey('72R843XwZxqWhsJceARQQTTbYtWy6Zw9et2YV4FpRHTa');
export const USDC_MINT              = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const USDC_DECIMALS = 6;
export const MIN_DEPOSIT_USDC = 10;
// Anchor discriminator for `deposit` = sha256("global:deposit")[:8]:
const DEPOSIT_DISCRIMINATOR = Buffer.from([0xf2,0x23,0xc6,0x89,0x52,0xe1,0xf2,0xb6]);
```
`buildDepositInstruction(depositor, uiAmount)` assembles a 10-account `TransactionInstruction` (depositor, depositor USDC ATA, central state, vault, token program, associated-token program, USDC mint, system program, event authority PDA `['__event_authority']`, program id). Amount encoded as little-endian u64 lamports (`uiAmount * 10^6`).

---

## 9. `useSettings()` (`useSettings.ts`)

localStorage-backed UI prefs, no network.

```ts
export interface Settings { showQuickBar: boolean; showWallet: boolean; showNotifications: boolean }
const defaultSettings = { showQuickBar:true, showWallet:true, showNotifications:true };
function useSettings(): Settings
```
- Loads from `localStorage['tfc-settings']` on mount (merged over defaults).
- Listens for custom event `'tfc-settings-changed'` (`CustomEvent<Settings>`) on `window`, updates state from `event.detail`. The writer (a settings UI component) dispatches this event after persisting — not in this hook.

---

## 10. Builder-code hooks (`useBuilderCode.ts`)

Pacifica requires a one-time builder-code approval before a wallet can route orders through the platform (default `'TradeClub'`). Uses `sonner` `toast`, not `notify`.

### `useBuilderCodeStatus()`
- Query `['builder-code', addr]` -> `GET /api/builder-code?account={addr}` -> `result.data`.
- `staleTime: 60000`, `refetchInterval: false` (on-demand only).

```ts
interface BuilderCodeStatus {
  approved: boolean; builderCode: string;
  approval?: { builder_code: string; description: string; max_fee_rate: string; updated_at: number } | null;
}
```

### `useApproveBuilderCode()`
- Mutation arg: `maxFeeRate: string = '0.0005'`.
- Sign: `createSignedApproveBuilderCode(wallet, { builder_code: BUILDER_CODE, max_fee_rate: maxFeeRate })`.
- `POST /api/builder-code` body `{ account, signature, timestamp, max_fee_rate }`.
- onSuccess: invalidate `['builder-code']`; `toast.success('Trading authorization approved')`. onError: `toast.error(...)`.

### `getBuilderCode()`
- Returns the `BUILDER_CODE` constant. (Non-hook helper.)

---

## 11. `useAuth()` (`useAuth.ts`)

Wallet sign-in/out. Bridges `@solana/wallet-adapter-react` with the Zustand `useAuthStore` (`@/lib/store`) and the global `queryClient` (`@/lib/queryClient`).

```ts
function useAuth(): {
  token; user; isAuthenticated; pacificaConnected; pacificaFailReason;
  isAuthenticating; isConnecting; isWalletConnected; walletAddress;
  login: () => Promise<...>; logout: () => void; setPacificaConnected;
}
```
- `AUTH_MESSAGE = 'Sign this message to authenticate with Trading Fight Club'`.
- **login()**: `signMessage(encode(AUTH_MESSAGE))` -> `bs58.encode(sig)` -> reads referral code via `getStoredReferralCode()` (from `@/lib/hooks/useReferralTracking`) -> `api.connectWallet(pubkey, sigBase58, referralCode)` -> `POST /auth/connect` body `{ walletAddress, signature, referralCode }`, returns `{ token, user, pacificaConnected, pacificaFailReason }` -> `setAuth(...)` -> clears stored referral code. Module-level guards (`globalAuthInProgress`, `globalHasAttempted`) prevent duplicate signature prompts across components.
- **Auto-login** effect: after Zustand hydration (`_hasHydrated`), if connected and not yet authenticated, auto-calls `login()` once. If already authenticated with the same wallet, invalidates `['pacifica-connection']` to refresh stale Pacifica status.
- **Account-change detection**: three mechanisms — adapter address diff, direct provider `accountChanged` listeners (Phantom/Solflare/Backpack/generic `window.solana`), and a focus/visibility re-check (mobile). On mismatch: `clearAuth()` + `queryClient.clear()` + `disconnect()`.
- **logout()** / disconnect: `clearAuth()`, `queryClient.clear()`, reset guard flags, `disconnect()`.

Referral tracking is a non-terminal growth feature; `useAuth` only reads localStorage and passes the code through — safe to no-op during migration if referrals aren't ported.

---

## 12. Fight coupling to strip (quick index)

| File | Where | Action |
|---|---|---|
| `useStakeInfo.ts` | entire file + socket.io to `:3002`, `STAKE_INFO`, `?fight=` | delete file & imports |
| `useOrders.ts` | `CreateMarketOrderParams.fightId/leverage/isPreFightFlip`; `useCreateMarketOrder` `fight_id`/`leverage`/`is_pre_fight_flip` body + `['fight-*']` & `['stake-info']` invalidations | strip fields & blocks |
| `useOrders.ts` | `CreateLimitOrderParams.fightId/leverage`, `SetPositionTpSlParams.fightId`, `CreateStopOrderParams.fightId`, `CreateStandaloneStopOrderParams.fightId/leverage` + their `fight_id` body fields | strip |
| `useOrders.ts` | `useCreateStandaloneStopOrder` onSuccess `['fight-orders']`/`['stake-info']` block | delete |
| `useAccount.ts` | none (clean) | — |

Note: `leverage` on order params doubles as fight-only (FightTrade ROI) but a non-fight terminal may still want to persist leverage per trade locally; decide per use. The `/api/orders` proxy ignores it when no `fight_id`.

---

## 13. Required env vars

| Var | Used by | Default |
|---|---|---|
| `NEXT_PUBLIC_PACIFICA_BUILDER_CODE` | `useOrders`, `useBuilderCode` | `'TradeClub'` |
| `NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL` | `useDeposit`, `useUsdcBalance` | falls back below |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | `useDeposit`, `useUsdcBalance` | `https://api.mainnet-beta.solana.com` |
| `NEXT_PUBLIC_WS_URL` | `useStakeInfo` (fight only) | `http://localhost:3002` |
