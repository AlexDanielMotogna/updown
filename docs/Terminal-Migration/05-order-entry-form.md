# Order Entry / Trade Form

Part of the Trading Terminal Migration set — see [README](./README.md)

This doc covers the **order entry panel** ("Place Order" card) of the trading terminal: the market/limit/stop tabs, the Buy/Long–Sell/Short toggle, leverage slider, size inputs, margin-mode selector, TP/SL inputs, reduce-only, the order preview, and every submit/handler function plus the exact Pacifica-proxy API calls. It also flags exactly where the duel/fight layer is interwoven so the migrator can strip it.

All code lives in **`apps/web/src/app/trade/page.tsx`** (the `TradePageContent` component, ~4047 lines) unless noted. Order mutation hooks live in **`apps/web/src/hooks/useOrders.ts`**.

> There are **two** copies of the order-entry markup in `page.tsx`:
> - **Desktop** panel: lines ~2450–3290 (the `Right: Order Entry` card).
> - **Mobile bottom-sheet** panel: lines ~3399–3790 (rendered inside `showOrderSheet`).
>
> They share the same state and handlers — they differ only in class names / layout. Rebuild from the desktop block; the mobile block is a near-duplicate that calls `handlePlaceOrder()` then `closeOrderSheet()`.

---

## 1. State (all `useState` in `TradePageContent`)

| State | Type / init | Purpose |
|---|---|---|
| `selectedMarket` | `string` = `urlSymbol \|\| 'BTC-USD'` | Selected symbol, `BTC-USD` style |
| `selectedSide` | `'LONG' \| 'SHORT'` = `'LONG'` | Buy/Long vs Sell/Short |
| `orderSize` | `string` = `''` | **Margin** in USD (NOT notional). Notional = `orderSize * leverage` |
| `leverage` | `number` = `5` | Currently chosen leverage (UI) |
| `savedLeverage` | `number` = `5` | Server-confirmed leverage; submit blocked while `leverage !== savedLeverage` |
| `isIsolated` | `boolean` = `false` | `false` = Cross, `true` = Isolated |
| `orderType` | `'market' \| 'limit' \| 'stop-market' \| 'stop-limit'` = `'market'` | Order type tab |
| `limitPrice` | `string` = `''` | Limit price (limit + stop-limit) |
| `triggerPrice` | `string` = `''` | Stop trigger price (stop-market + stop-limit) |
| `tpEnabled` / `slEnabled` | `boolean` = `false` | TP/SL section toggles |
| `takeProfit` / `stopLoss` | `string` = `''` | TP / SL trigger prices |
| `reduceOnly` | `boolean` = `false` | Reduce-only order |
| `slippage` | `string` = `'0.5'` | Max slippage % for market orders |
| `showMarginModeModal` / `pendingMarginMode` | modal state | Margin-mode confirm modal |
| `showSlippageModal` / `slippageInput` | modal state | Slippage edit modal |
| `showCloseOppositeModal` / `pendingOrder` | modal state | Confirm modal when opening against an opposite position |

### Market metadata (from `usePrices`)
`const { markets, getPrice } = usePrices()` then `const currentPriceData = getPrice(selectedMarket)`:

```ts
const currentPrice = currentPriceData?.oracle || currentPriceData?.price || 0; // used for size calc
const markPrice    = currentPriceData?.price || currentPrice;
const maxLeverage  = currentPriceData?.maxLeverage || 10;
const tickSize     = currentPriceData?.tickSize || 0.01;   // price increment
const lotSize      = currentPriceData?.lotSize || 0.00001; // size increment
```

### Rounding helpers (verbatim)
```ts
const roundToLotSize = (amount: number, lotSize: number): string => {
  const precision = Math.max(0, -Math.floor(Math.log10(lotSize)));
  const rounded = Math.floor(amount / lotSize) * lotSize; // floor to avoid Pacifica rejection
  return rounded.toFixed(precision);
};
const roundToTickSize = useCallback((price: number): string => {
  const rounded = Math.round(price / tickSize) * tickSize;
  const decimals = tickSize >= 1 ? 0 : Math.ceil(-Math.log10(tickSize));
  return rounded.toFixed(decimals);
}, [tickSize]);
```

### Trade gating flag
```ts
const builderCodeApproved = builderCodeStatus?.approved ?? false;
const canTrade = connected && isAuthenticated && pacificaConnected && builderCodeApproved;
```
`canTrade` disables every input in the form. `connected`/`pacificaConnected`/`isAuthenticated` come from `useWallet()` + `useAuth()`; `builderCodeApproved` from `useBuilderCodeStatus()` (a one-time Pacifica builder-code authorization — see section 10).

---

## 2. UX layout (top to bottom of the "Place Order" card)

1. **Header**: `Place Order` + a `Cross`/`Isolated` pill button (top-right) that opens the margin-mode modal. Disabled when `!canTrade || hasOpenPosition`.
2. **Warning banners** (mutually exclusive, block trading): Beta-access required, No Pacifica account, Builder-code authorization required, Connect wallet / Authenticating.
3. **Order Type tabs** (underline style): `Market` / `Limit` / `Stop` / `Stop Limit`.
4. **Buy/Long -- Sell/Short** 2-col toggle. LONG = green (`win-500`), SHORT = pink `#e8566d`.
5. **[FIGHT] Fight Capital accordion** — only when `inFight` (strip — see section 8).
6. **Leverage slider** (custom pointer-drag track 1x to maxLeverage) + a `Set` button that appears only when `leverage !== savedLeverage`.
7. **Price inputs** — only when `orderType !== 'market'`: Trigger Price (stop types) and/or Limit Price (limit/stop-limit). Each has a `Mid` button that fills `currentPrice.toFixed(2)`.
8. **Size input** — paired Token input + USD (notional) input, a margin/% slider, and `25/50/75/100%` buttons. Shows `Margin: $x` and `Max: $y (Nx)`.
9. **Reduce Only** toggle (`Toggle` component).
10. **Take Profit / Stop Loss** section — only for `market`/`limit` and `!reduceOnly`. Master toggle + TP price input + SL price input, each with %-of-PnL quick buttons.
11. **Order preview** — Max Slippage (clickable, opens slippage modal, market only) / Limit Price / Trigger Price / Est. Liq Price / Margin / Available.
12. **[FIGHT] Blocked-symbol warning** (strip — see section 8).
13. **Submit button** — green for LONG, pink for SHORT; label = `Buy / Long{typeLabel}` or `Sell / Short{typeLabel}`.
14. **Deposit / Withdraw** buttons + collapsible **Account Info** stats.

The shared CSS classes `.input` and `.card` are defined in `apps/web/src/app/globals.css` (see [Design tokens](./02-design-tokens-css.md)):
```css
.card  { @apply bg-surface-850 border-surface-800 rounded-none; }
.input { @apply w-full border-surface-800 rounded px-3 py-2 text-zinc-100
                placeholder:text-surface-500 transition-colors duration-150
                focus:outline-none focus:border-surface-500; }
```

### Size input — the margin/token/notional math (verbatim logic)
`orderSize` stores **margin** (USD). The token field and the USD field both write back to `orderSize`:
```ts
const effectiveLeverage = Math.min(leverage, maxLeverage);
const available   = account ? parseFloat(account.availableToSpend) : 0;
const MARGIN_BUFFER = 0.95;                       // use 95% of available
const maxMargin   = reduceOnly
  ? (closeablePosition ? closeablePosition.margin : 0)
  : available * MARGIN_BUFFER;
const margin      = parseFloat(orderSize || '0');
const positionSize = margin * effectiveLeverage;  // notional USD
const tokenAmount  = currentPrice > 0 ? positionSize / currentPrice : 0;

// Token input onChange: margin = (tokens * price) / leverage
// USD   input onChange: margin = notional / leverage
// % buttons / slider:   orderSize = (maxMargin * pct/100).toFixed(2)
```

### Leverage slider
Custom pointer-captured track, value clamped `1..maxLeverage`:
```ts
const pct = Math.max(0, Math.min(1, (e.clientX - rect.left - pad) / (rect.width - pad*2))); // pad=9
setLeverage(Math.max(1, Math.min(maxLeverage, Math.round(1 + pct * (maxLeverage - 1)))));
```
Display shows `Math.min(leverage, maxLeverage)x`. While `leverage !== savedLeverage` a yellow "Confirm leverage change with **Set**" hint shows and **the submit button is disabled** (see section 6).

### TP/SL quick-% buttons
Reference price `refPrice = (orderType==='limit' && limitPrice) ? parseFloat(limitPrice) : currentPrice`. With `effectiveLev = Math.min(leverage, maxLeverage)`:
```ts
const calcTpPrice = (gainPct) => { const m=(gainPct/100/effectiveLev)*refPrice;
  return roundToTickSize(selectedSide==='LONG' ? refPrice+m : refPrice-m); };
const calcSlPrice = (lossPct) => { const m=(Math.abs(lossPct)/100/effectiveLev)*refPrice;
  return roundToTickSize(selectedSide==='LONG' ? refPrice-m : refPrice+m); };
```
TP buttons: `[25,50,75,100]` %. SL buttons: `[-25,-50,-75,-100]` %.

---

## 3. Handler functions (name to what it does)

| Handler | What it does |
|---|---|
| `handleMarketChange(symbol)` | Sets `selectedMarket`, updates URL `?symbol=` (preserves `?fight=` — **fight coupling**). |
| `canSetLeverage(lev)` | Returns `{valid,error}`. Blocks **decreasing** leverage below an open position's leverage (Pacifica only allows increase). |
| `handleSetLeverage()` | Validates via `canSetLeverage`, calls `setLeverageMutation` then on success sets `savedLeverage = leverage`. |
| `handleSetMarginMode(isolated)` | Opens confirm modal (`setPendingMarginMode` + `setShowMarginModeModal`). No-op if unchanged. |
| `confirmMarginMode()` | Calls `setMarginModeMutation`; on success sets `isIsolated` and closes modal. |
| `hasOpenPosition` (memo) | True if current market has an open position to disable margin-mode change. |
| `executeOrder()` | **Core submit.** Builds amount/TP/SL, validates min size, dispatches the correct create-order mutation, then clears the form. (Full detail in section 4.) |
| `handlePlaceOrder()` | **Pre-submit gate.** Auth checks, [FIGHT] max-size check, opposite-position check then either opens `CloseOppositeModal` or calls `executeOrder()`. |
| `handleChartQuickOrder` / `handleQuickOrderSubmit` | Chart right-click to place a limit order at the clicked price (separate quick-order flow). |
| `handleCancelOrder` / `handleEditOrder` | Cancel / edit open orders (Positions/Orders tables — see [Positions & Orders](./07-positions-orders.md)). |
| `handleClosePosition` / `handleCloseAllPositions` / `handleSetTpSl` | Position management (documented in the Positions doc). |

---

## 4. `executeOrder()` — submit flow (verbatim essentials)

```ts
const effectiveLeverage     = Math.min(leverage, maxLeverage);
const effectivePositionSize = parseFloat(orderSize) * effectiveLeverage; // notional USD

const priceForCalc = (orderType === 'limit' || orderType === 'stop-limit')
  ? (parseFloat(limitPrice) || currentPrice) : currentPrice;
const rawAmount   = effectivePositionSize / priceForCalc;
const orderAmount = roundToLotSize(rawAmount, lotSize); // token amount string

// TP/SL only for market & limit, tick-rounded:
const tpParam = (orderType==='market'||orderType==='limit') && tpEnabled && takeProfit
  ? { stop_price: roundToTickSize(parseFloat(takeProfit)) } : undefined;
const slParam = (orderType==='market'||orderType==='limit') && slEnabled && stopLoss
  ? { stop_price: roundToTickSize(parseFloat(stopLoss)) } : undefined;

// MIN ORDER SIZE = $11 notional (Pacifica minimum)
if (effectivePositionSize < 11) { toast.error(`Minimum order size is $11 ...`); return; }

const symbol = selectedMarket.replace('-USD', '');     // 'BTC-USD' -> 'BTC'
const side   = selectedSide === 'LONG' ? 'bid' : 'ask'; // LONG=bid, SHORT=ask
```

Then branches by `orderType`:

- **market** -> `createMarketOrder.mutateAsync({ symbol, side, amount: orderAmount, reduceOnly, slippage_percent: slippage, take_profit: tpParam, stop_loss: slParam, fightId: fightId || undefined, leverage })`
- **limit** -> requires `limitPrice`; `createLimitOrder.mutateAsync({ symbol, side, price: limitPrice, amount: orderAmount, reduceOnly, tif: 'GTC', take_profit, stop_loss, fightId, leverage })`
- **stop-market / stop-limit** -> validates trigger present; **direction rule**: buy stop (`bid`) trigger must be **above** `currentPrice`, sell stop (`ask`) trigger must be **below**. Then `createStandaloneStopOrder.mutateAsync({ symbol: selectedMarket, side, stopPrice: roundToTickSize(triggerPrice), amount: orderAmount, limitPrice: orderType==='stop-limit' ? roundToTickSize(limitPrice) : undefined, reduceOnly, fightId, leverage })`

On success the form clears: `orderSize`, `limitPrice`, `triggerPrice`, `takeProfit`, `stopLoss`, `tpEnabled`, `slEnabled` and the opposite-position modal state. Errors are surfaced by each hook's `onError` (toast); `executeOrder` just `console.error`s.

### `handlePlaceOrder()` gate (verbatim essentials)
```ts
if (!isAuthenticated)   { alert('Please connect wallet to trade'); return; }
if (!pacificaConnected) { alert('Please connect your Pacifica account first'); return; }

// [FIGHT] max-size check — STRIP:
const effectivePositionSize = parseFloat(orderSize) * Math.min(leverage, maxLeverage);
if (inActiveFight && fightMaxSize > 0 && effectivePositionSize > fightMaxSize) {
  toast.error(`Position size ... exceeds fight max size ...`); return;
}

// Opposite-position guard (KEEP — pure trading UX):
const oppositeApiPosition = apiPositions.find(
  (pos) => pos.symbol === selectedMarket && pos.side !== selectedSide);
if (oppositeApiPosition) { /* build pendingOrder, setShowCloseOppositeModal(true); return; */ }

await executeOrder();
```

---

## 5. Exact API calls (all go through Next.js route handlers that proxy Pacifica)

Every mutation is **client-side signed** with the Solana wallet (`createSigned*` from `apps/web/src/lib/pacifica/signing.ts`) and posts `{ ...payload, signature, timestamp }`. The wallet pubkey base58 is sent as `account`. Builder code default = `process.env.NEXT_PUBLIC_PACIFICA_BUILDER_CODE || 'TradeClub'`.

### 5.1 Market order — `useCreateMarketOrder` -> `POST /api/orders`
```jsonc
{
  "account": "<solana-pubkey-base58>",
  "symbol": "BTC", "side": "bid",   // bid=LONG, ask=SHORT
  "type": "MARKET",
  "amount": "0.00082",              // token amount (floored to lotSize)
  "reduce_only": false,
  "slippage_percent": "0.5",
  "builder_code": "TradeClub",
  "take_profit": { "stop_price": "95000" },  // optional
  "stop_loss":   { "stop_price": "90000" },  // optional
  "signature": "...", "timestamp": 1700000000000,
  "fight_id": "<uuid|undefined>",   // [FIGHT] — STRIP
  "leverage": 5,                    // [FIGHT] stored for FightTrade ROI — STRIP
  "is_pre_fight_flip": false        // [FIGHT] — STRIP
}
```
Response: `{ data: { order_id, avg_price?, price? , ... } }`. Success toast: `"{amount} {symbol} filled at {avg_price}"`. Invalidates `['positions']`,`['orders']`,`['account']` (+ delayed re-invalidate for TP/SL propagation).

### 5.2 Limit order — `useCreateLimitOrder` -> `POST /api/orders`
Same shape with `"type":"LIMIT"`, plus `"price"`, `"tif":"GTC"` (`'GTC'|'IOC'|'ALO'|'TOB'`), `"post_only"` (sent but **not** a real Pacifica field — always false). Same optional TP/SL and the same `fight_id`/`leverage` extras.

### 5.3 Standalone stop order — `useCreateStandaloneStopOrder` -> `POST /api/orders/stop/create`
```jsonc
{
  "account": "...", "symbol": "BTC", "side": "bid",
  "reduce_only": false,
  "stop_order": { "stop_price": "95000", "amount": "0.001", "limit_price": "95010" }, // limit_price only for stop-limit
  "signature": "...", "timestamp": 1700000000000,
  "fight_id": "<uuid|undefined>"   // [FIGHT] — STRIP
}
```

### 5.4 Set leverage — `useSetLeverage` -> `POST /api/account/leverage`
```jsonc
{ "account":"...", "symbol":"BTC", "leverage":"5", "signature":"...", "timestamp": 0 }
```
Invalidates `['account-settings']`. Error containing `InvalidLeverage` -> friendly "Cannot decrease leverage while position is open".

### 5.5 Set margin mode — `useSetMarginMode` -> `POST /api/account/margin`
```jsonc
{ "account":"...", "symbol":"BTC", "is_isolated":true, "signature":"...", "timestamp": 0 }
```

### 5.6 Cancel — `useCancelOrder` -> `DELETE /api/orders/{orderId}?account=&symbol=&signature=&timestamp=`
### 5.7 Cancel stop — `useCancelStopOrder` -> `POST /api/orders/stop/cancel` `{account,symbol,order_id,signature,timestamp}`
### 5.8 Cancel all — `useCancelAllOrders` -> `DELETE /api/orders?account=&signature=&timestamp=[&symbol=]`
### 5.9 Edit order — `useEditOrder` -> `POST /api/orders/edit` `{account,symbol,price,amount,order_id,signature,timestamp}` (cancel+recreate as TIF=ALO)
### 5.10 Set position TP/SL — `useSetPositionTpSl` -> `POST /api/positions/tpsl`
Side is flipped to the **closing** side (`LONG`->`ask`, `SHORT`->`bid`). `take_profit`/`stop_loss` = `{stop_price, limit_price?}`; **`null` = remove, `undefined` = no change, object = set**. `builder_code` is NOT valid here. `size` (token units) included only for partial.
### 5.11 Partial TP/SL — `useCreateStopOrder`: **TP** -> reduce-only `LIMIT` via `POST /api/orders`; **SL** -> `POST /api/orders/stop/create`.
### 5.12 Withdraw — `useWithdraw` -> `POST /api/account/withdraw` `{account,amount,signature,timestamp}`.
### 5.13 Batch — `useBatchOrders` -> `POST /api/orders/batch` (max 10 pre-signed `Create`/`Cancel` actions).

> **Backend cross-check:** `apps/web/src/app/api/orders/route.ts` parses `fight_id`, `leverage`, `is_pre_fight_flip` and calls `assertSymbolNotBlocked(...)` and `validateStakeLimit(...)` from `apps/web/src/lib/server/orders.ts` **before** forwarding to Pacifica. Both are [FIGHT] gates — when migrating without fights, delete those two calls and the three extra body fields. See section 8.

---

## 6. Client-side validation (in order of checks)

| Check | Where | Behavior |
|---|---|---|
| Wallet connected | `handlePlaceOrder` | `alert('Please connect wallet to trade')` |
| Pacifica connected | `handlePlaceOrder` | `alert('Please connect your Pacifica account first')` |
| **Min notional $11** | `executeOrder` | toast error if `orderSize*leverage < 11` |
| Limit price required | `executeOrder` (limit) | toast "Please enter a limit price" |
| Trigger price required + valid | `executeOrder` (stop) | toast, must be `> 0` |
| Stop-limit needs limit price | `executeOrder` | toast |
| **Stop direction** | `executeOrder` | buy stop trigger must be `> currentPrice`; sell stop must be `< currentPrice` |
| Leverage not decreased below open pos | `canSetLeverage` | toast, blocks `Set` |
| **Submit disabled** | button `disabled` | `!canTrade \|\| <any create*>.isPending \|\| leverage !== savedLeverage \|\| isSymbolBlocked` |
| Slippage range | slippage modal | accepts `0.01-10` only |

The amount is floored to `lotSize`; all prices (TP/SL/trigger/stop-limit) rounded to `tickSize` to avoid Pacifica "Invalid stop tick"/rejection errors.

---

## 7. Modals tied to the form

- **CloseOppositeModal** (`@/components/CloseOppositeModal`) — shown by `handlePlaceOrder` when opening against an opposite position; confirming calls `executeOrder()`.
- **Margin-mode confirm modal** (inline, lines ~3896–3973) — radio Isolated/Cross + Cancel/Confirm -> `confirmMarginMode()`.
- **Slippage modal** (inline, lines ~3975–4024) — numeric input clamped `0.01-10`, writes `slippage`. Note text: *"Applies to market orders from the order form. Close orders use 8% and TP/SL use 10%."*
- **WithdrawModal** / **EditOrderModal** — separate components (see [Modals](./09-modals.md)).

---

## 8. FIGHT ENTANGLEMENTS — what to strip

The order form is **functional without fights**; the fight layer is additive gating. To get a clean terminal:

| Location | Fight code to remove | Replacement when no fights |
|---|---|---|
| Imports (line 7) | `useFight, useStakeInfo, useFightPositions, useFightTrades, useFightOrders, useFightOrderHistory` | drop |
| `inActiveFight, fightMaxSize, fightId` (from `useFight`) | used for max-size + tagging | `fightId` -> always `undefined` |
| `useStakeInfo()` -> `inFight, stake, currentExposure, maxExposureUsed, availableStake, blockedSymbols` | drives Fight Capital accordion + blocked symbols | drop |
| `isSymbolBlocked` memo + auto-switch `useEffect` (lines ~106-108, 274-286) | blocks/auto-switches symbols pre-fight | drop |
| **Fight Capital accordion** JSX (lines ~2583-2633) | entire collapsible block | delete |
| **Blocked-symbol warning** JSX (lines ~3180-3185) | amber warning | delete |
| `handlePlaceOrder` max-size guard (lines ~536-541) | `inActiveFight && fightMaxSize` check | delete the `if` |
| Submit `disabled` (line ~3190) | `\|\| isSymbolBlocked` and label `'Symbol Blocked'` | remove |
| All `fightId: fightId \|\| undefined` and `leverage` extras passed to `createMarketOrder/createLimitOrder/createStandaloneStopOrder/createStopOrder/setPositionTpsl` | fight tagging | pass nothing / drop those fields |
| `handleMarketChange` URL build (lines ~115-118) | preserves `?fight=` | use plain `/trade?symbol=` |
| `useCreateMarketOrder` payload (`useOrders.ts`) | `fight_id`, `leverage`, `is_pre_fight_flip` + all `if (variables.fightId) { invalidate fight-* }` blocks | remove fields + fight invalidations |
| `useCreateLimitOrder` / `useCreateStandaloneStopOrder` / `useCreateStopOrder` / `useSetPositionTpSl` payloads | `fight_id` (and `leverage`) | remove |
| **Backend** `apps/web/src/app/api/orders/route.ts` | `assertSymbolNotBlocked(...)`, `validateStakeLimit(...)`, `fight_id`/`leverage`/`is_pre_fight_flip` parsing, `STAKE_INFO` emit | delete; keep the plain Pacifica forward |
| `apps/web/src/lib/server/orders.ts` | `validateStakeLimit`, `assertSymbolNotBlocked`, blocked-symbol/exposure logic | delete file (terminal doesn't need it) |
| `handleClosePosition` `flip` branch | `isPreFightFlip` + `fightId` | drop those args |

Also strip the fight-only display components rendered above the grid: `<FightBanner />`, `<ActiveFightsSwitcher />` (and the `showFightOnly` filtering of positions/trades tables — see [Positions & Orders](./07-positions-orders.md)).

### What the form looks like WITHOUT fights
Identical visually **minus** the Fight Capital accordion and the blocked-symbol warning. The submit button drops the `Symbol Blocked` state. `executeOrder` and all mutations run exactly the same; only the `fight_id`/`leverage`/`is_pre_fight_flip` extras and the two backend guards disappear. The `$11` min-notional, `95%` margin buffer, lot/tick rounding, opposite-position confirm modal, leverage `Set` confirmation, margin-mode modal, and slippage modal are all **pure terminal** features to keep.

---

## 9. Constants & env vars used by the form

```ts
const DEFAULT_MARKET = { symbol: 'BTC-USD', name: 'Bitcoin', maxLeverage: 50 };
const PACIFICA_DEPOSIT_URL = 'https://app.pacifica.fi?referral=TFC';
const TRADECLUB_FEE = 0.0005; // 0.05% builder fee, added to Pacifica maker/taker for display
const MIN_ORDER_NOTIONAL = 11; // $ (inline literal in executeOrder)
const MARGIN_BUFFER = 0.95;    // inline literal in Size input
```
Fees displayed = `((pacificaTakerFee + TRADECLUB_FEE) * 100)` etc., with Pacifica fees pulled live from `account.takerFee` / `account.makerFee` (fallbacks `0.0007` / `0.000575`).

| Env var | Used by |
|---|---|
| `NEXT_PUBLIC_PACIFICA_BUILDER_CODE` | default builder code (`'TradeClub'`) in `useOrders.ts` |
| `NEXT_PUBLIC_WS_URL` | stake-info socket (`useStakeInfo`) — fight-only |

---

## 10. Builder-code authorization (terminal prerequisite, keep)

Before the first trade Pacifica requires a one-time builder-code approval. `useBuilderCodeStatus()` (`apps/web/src/hooks/useBuilderCode.ts`) gates `canTrade`; `useApproveBuilderCode()` is called as `approveBuilderCode.mutate('0.0005')` from the "Authorize Trading" banner. This is **not** a fight feature — keep it (or replace with the new exchange's equivalent onboarding).

---

## Cross-links
- [Design tokens & CSS](./02-design-tokens-css.md) — `.input`, `.card`, surface/win/loss colors, Toggle styling.
- [Positions & Orders](./07-positions-orders.md) — `handleClosePosition`, `handleSetTpSl`, open-orders cancel/edit, table fight filtering.
- [Modals](./09-modals.md) — CloseOpposite / Withdraw / EditOrder modals.
- [UI primitives](./10-ui-primitives.md) — `Toggle`, sliders, button styles.
