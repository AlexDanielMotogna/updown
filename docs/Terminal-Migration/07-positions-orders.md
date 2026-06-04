# Positions & Open Orders Panels

Part of the Trading Terminal Migration set — see [README](./README.md).

This doc covers the **bottom-panel data tables** of the terminal: the Positions table (with PnL/ROE, close/limit-close/flip/TP-SL actions), the Open Orders table (with cancel/edit), and the navbar "quick positions" carousel + quick-action modal. It documents the exact props, types, formatting rules, and how each action wires into its modal and into the `useOrders` mutation hooks.

> **Scope note:** The action *modals themselves* (`MarketCloseModal`, `LimitCloseModal`, `FlipPositionModal`, `TpSlModal`) are described where they are invoked here, but their full internals belong to a sibling doc on order-entry modals. PnL/leverage math helpers (`calculatePositionMetrics`, `calculateTpPrice`, `calculateSlPrice`, `roundToLotSize`, `roundToTickSize`, `formatPrice`) live in `@/lib/trading/utils` and are referenced but not reproduced in full.

---

## File map

| File | Role |
|------|------|
| `apps/web/src/components/Positions.tsx` (728 lines) | The positions table — desktop table + mobile cards, sort, summary footer, and the 4 action modals. **Pure presentational** — all data + callbacks come from props. |
| `apps/web/src/components/QuickPositionsBar.tsx` | Navbar carousel (`QuickPositionsBar`) + navbar dropdown (`QuickPositionsDropdown`). Self-contained: pulls its own data from hooks. |
| `apps/web/src/components/QuickPositionModal.tsx` | Bottom-sheet modal opened from the quick bar/dropdown. Self-contained: calls `useOrders` mutations directly. |
| `apps/web/src/hooks/usePositions.ts` | `usePositions`, `useAccountInfo`, `useAccountSettings`, `useOpenOrders`, `useMarkets`, `useMarket`, `useTradeHistory`, `useOrderHistory`. |
| `apps/web/src/hooks/useOrders.ts` | All trading mutations (market/limit/cancel/cancel-stop/cancel-all/TP-SL/stop/leverage/margin/edit/batch/withdraw). |
| `apps/web/src/app/trade/page.tsx` | The terminal page. Maps raw API positions → `Position[]`, renders the **Open Orders table inline** (not a component), and supplies all `<Positions>` callbacks. |

> **The Open Orders table has no dedicated component.** It is rendered inline inside `apps/web/src/app/trade/page.tsx` (~lines 1865–2083), both a mobile card view and a desktop `<table>`. To migrate it, extract that JSX into a component. Its data shape and handlers are documented below.

---

## 1. The `Position` display type

`Positions.tsx` consumes a **derived** `Position` (do not confuse with the raw WebSocket `Position`). Exported from `Positions.tsx`:

```ts
export interface TpSlOrder {
  orderId: string;
  type: 'TP' | 'SL';
  triggerPrice: number;
  amount: number;            // size in token units
  orderType: 'market' | 'limit';
  limitPrice?: number;
}

export interface Position {
  id: string;                // "SYMBOL-SIDE", e.g. "BTC-USD-LONG"  ← used to route close actions
  symbol: string;            // "BTC-USD"
  side: 'LONG' | 'SHORT';
  size: number;              // position VALUE in USD (at mark)
  sizeInToken: number;       // size in token units (e.g. 0.00011 BTC)
  entryPrice: number;
  markPrice: number;
  leverage: number;
  liquidationPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number; // ROE % = (pnl / margin) * 100
  margin: number;
  marginType: 'Cross' | 'Isolated';
  funding: number;
  takeProfit?: number;       // legacy single TP (first tpOrders entry)
  stopLoss?: number;         // legacy single SL (first slOrders entry)
  tpOrders?: TpSlOrder[];    // all TP orders attached to position
  slOrders?: TpSlOrder[];    // all SL orders attached to position
}
```

> ⚠️ **Two different `Position` types exist.** The **raw** Pacifica WebSocket position (`@/hooks/usePacificaWebSocket` — `{ symbol, side: 'bid'|'ask', amount, entry_price, margin, funding, isolated, liq_price, updated_at }`) is what `QuickPositionsBar`/`QuickPositionModal` consume. The **derived** one above (string side, numeric fields, TP/SL attached) is what `<Positions>` consumes. The mapping from raw → derived happens in `trade/page.tsx` (`displayPositions`, see §5).

### `PositionsProps`

```ts
interface PositionsProps {
  positions: Position[];
  onClosePosition?: (positionId: string, closeType?: 'market'|'limit'|'flip',
                     params?: LimitCloseParams | MarketCloseParams) => void;
  onSetTpSl?: (params: TpSlParams) => Promise<void>;
  onCancelOrder?: (orderId: string, symbol: string, orderType: string) => Promise<void>;
  onCloseAll?: () => Promise<void>;
  isClosingAll?: boolean;
  readOnly?: boolean;          // hides close buttons, shows info banner
  readOnlyMessage?: string;
}

export interface LimitCloseParams { positionId: string; price: string; amount: string; percentage: number; }
// MarketCloseParams + TpSlParams are re-exported from MarketCloseModal / TpSlModal
```

`readOnly` is the **fight-view flag** — when a fight is showing positions read-only, the terminal passes `readOnly` and `readOnlyMessage`. For a fresh (non-fight) terminal you can drop `readOnly`/`readOnlyMessage` entirely; the Close column and TP/SL edit button just always render.

---

## 2. Positions table — layout & rendering

`Positions.tsx` renders three regions inside a `flex flex-col h-full`:

1. **Mobile cards** (`max-[1199px]:block hidden`) — collapsible `<button>` header (symbol + leverage badge + PnL) with an expandable 3-col data grid and Market/Limit/Flip buttons.
2. **Desktop table** (`max-[1199px]:hidden`, `min-w-[900px]`) — columns below.
3. **Summary footer** (`mt-auto`) — position count, total value, total PnL.

### Desktop columns (in order)

| Header | Source field | Notes |
|--------|--------------|-------|
| Token | `symbol` (`-USD` stripped) + side/leverage badge | badge: `{leverage}x Long/Short`, win/loss color |
| Size | `sizeInToken` | via `formatTokenAmount` |
| Position Value | `size` | `$${size.toFixed(2)}` |
| Entry | `entryPrice` | via `formatPrice` |
| Mark | `markPrice` | via `formatPrice` |
| PnL (ROI%) | `unrealizedPnl` + `unrealizedPnlPercent` | win/loss color, ROE in parens |
| Liq Price | `liquidationPrice` | always `text-loss-400` |
| Margin | `margin` + `marginType` | value + Cross/Isolated subtext |
| Funding | `funding` | win/loss color |
| TP/SL | `tpOrders`/`slOrders` or legacy `takeProfit`/`stopLoss` | clickable → opens `TpSlModal` |
| Close | — | only if `!readOnly`: **Market / Limit / Flip** buttons |

### Sorting

Local state `sort: { col: SortColumn; desc: boolean }`, default `{ col: 'pnl', desc: true }`. `SortColumn = 'token'|'size'|'value'|'entry'|'mark'|'pnl'|'liq'|'margin'|'funding'`. Clicking a header calls `toggleSort(col)` (toggles `desc` if same col, else new col + `desc:true`). Header shows `↓`/`↑`. Sort is shared between desktop table and mobile cards via `sortedPositions`.

### Formatting helpers (verbatim — reuse these to match the UI exactly)

```ts
const getTokenSymbol = (symbol: string) => symbol.replace('-USD', '');

const formatPrice = (price: number) => {
  if (price >= 10000) return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (price >= 100)   return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (price >= 1)     return price.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return price.toLocaleString(undefined, { maximumFractionDigits: 6 });
};

const formatTokenAmount = (amount: number, symbol: string) => {
  const token = getTokenSymbol(symbol);
  if (amount < 0.0001) return `${amount.toFixed(8)} ${token}`;
  if (amount < 0.01)   return `${amount.toFixed(6)} ${token}`;
  if (amount < 1)      return `${amount.toFixed(4)} ${token}`;
  return `${amount.toFixed(2)} ${token}`;
};
```

PnL is shown with extra precision when small: `Math.abs(pnl) < 1 ? toFixed(4) : toFixed(2)`, sign prefixed `+`/`-`. ROE: `(pnlPercent >= 0 ? '+' : '')${pnlPercent.toFixed(2)}%`.

### TP/SL cell content (`renderTpSlContent`)

- If `tpOrders.length > 1 || slOrders.length > 1` → shows counts: `"2 TPs / 1 SL"` (colored win/loss, `-` when none).
- Else → shows legacy single prices `formatPrice(takeProfit) / formatPrice(stopLoss)` (or `-`).
- When `!readOnly && onSetTpSl`, the cell is a `<button>` → `setTpSlPosition(pos)` (opens `TpSlModal`). Otherwise a plain `<div>`.

### Empty / read-only states

- `positions.length === 0` → centered "No open positions" (`min-h-full`, plus `readOnlyMessage` when `readOnly`).
- `readOnly && readOnlyMessage` → info banner at top with an info-circle SVG.

### Summary footer

```
Positions: {positions.length}
Total Value: ${sum(size).toFixed(2)}
Total PnL: ±${abs(sum(unrealizedPnl)).toFixed(4)}   // win/loss color
```

---

## 3. Action wiring (Positions table → modals → hooks)

All close/flip/TP-SL go through **local modal state** in `Positions.tsx`, then call the `on*` props. The modals themselves render at the bottom of the component, conditionally.

| Button | Local handler | Sets state | Modal rendered | On confirm |
|--------|---------------|------------|----------------|------------|
| **Market** | `handleClose(id,'market')` | `setMarketClosePosition(pos)` | `<MarketCloseModal>` | `handleMarketCloseConfirm(amount, pct)` → `onClosePosition(id,'market',{positionId,amount,percentage})` |
| **Limit** | `handleClose(id,'limit')` | `setLimitClosePosition(pos)` | `<LimitCloseModal>` | `handleLimitCloseConfirm(price,amount,pct)` → `onClosePosition(id,'limit',{positionId,price,amount,percentage})` |
| **Flip** | `handleClose(id,'flip')` | `setFlipPosition(pos)` | `<FlipPositionModal>` | `handleFlipConfirm()` → `onClosePosition(id,'flip')` |
| **TP/SL cell** | — | `setTpSlPosition(pos)` | `<TpSlModal>` | `handleTpSlConfirm(params)` → `onSetTpSl(params)` |

Each confirm sets an `isSubmitting*` flag (passed to the modal) and clears the modal state on completion. `closingId`/`closingType` drive the inline `...` spinner text on the buttons (only used for the non-modal direct path, which is currently unreachable since all three types open modals).

**Important effect:** after a TP/SL order cancel, `Positions.tsx` keeps the open `TpSlModal` in sync by re-finding the position in `positions` and updating `tpSlPosition` when `tpOrders`/`slOrders` change (JSON-compare). Reproduce this so the modal reflects live cancellations.

`onCancelOrder` is forwarded into `<TpSlModal>` (so it can cancel individual attached TP/SL orders); the Positions table itself does not render a cancel button.

---

## 4. The terminal-side callbacks (`trade/page.tsx`)

These are the concrete implementations the migrator must reproduce (or wire to equivalents). They translate the table's abstract `on*` props into `useOrders` mutations. **All take a position `id` of form `"SYMBOL-SIDE"` and split it back apart.**

### `handleClosePosition(positionId, closeType, params)`

```ts
const parts = positionId.split('-');
const side = parts[parts.length - 1];          // 'LONG' | 'SHORT'
const symbol = parts.slice(0, -1).join('-');    // 'BTC-USD'
const tokenSymbol = symbol.replace('-USD', ''); // 'BTC'
// find raw position: apiPositions.find(p => p.symbol === symbol && p.side === side)
```

- **limit:** `createLimitOrder.mutateAsync({ symbol: tokenSymbol, side: side==='LONG'?'ask':'bid', amount: params.amount, price: params.price, reduceOnly: true })`
- **flip:** `createMarketOrder.mutateAsync({ symbol: tokenSymbol, side: side==='LONG'?'ask':'bid', amount: (position.size*2).toString(), reduceOnly, slippage_percent:'1', ... })` then `toast.success("Position flipped to …")`. (2× size = close + reverse in one order.)
- **market (default):** `createMarketOrder.mutateAsync({ symbol: tokenSymbol, side: side==='LONG'?'ask':'bid', amount: params?.amount ?? position.size, reduceOnly: true, slippage_percent:'1' })`

Closing side rule everywhere: **LONG → `ask` (sell), SHORT → `bid` (buy)**. After each, `await refetchAccount()`.

### `handleCancelOrder(orderId, symbol, orderType)`

```ts
const isStopOrder = orderType && (orderType.includes('TP') || orderType.includes('SL') || orderType.includes('STOP'));
if (isStopOrder) await cancelStopOrder.mutateAsync({ symbol, orderId: parseInt(orderId) });
else            await cancelOrder.mutateAsync({ symbol, orderId: parseInt(orderId) });
await refetchAccount();
```
Stop/TP/SL orders **must** use the `cancel_stop_order` path (`useCancelStopOrder`), not the regular cancel.

### `handleSetTpSl(params: TpSlParams)`

Branches on `params.isPartial`:
- **partial** (`isPartial && partialAmount`): create separate `createStopOrder` calls for TP and/or SL (`type:'TAKE_PROFIT'|'STOP_LOSS'`, `amount: partialAmount`). Internally TP becomes a `reduce_only` LIMIT order and SL becomes a stop order (see `useCreateStopOrder` in §6).
- **full**: `setPositionTpSl.mutateAsync({ symbol, side, size, take_profit, stop_loss, fightId })`. `null` = remove, object `{stop_price, limit_price}` = set, `undefined` = no change.

### `handleCloseAllPositions()`

Loops every `apiPositions` entry and fires a reduce-only market close (`slippage_percent:'1'`), toggling `isClosingAllPositions`. Wired to `<Positions onCloseAll>` / `isClosingAll` (note: the Positions component declares these props but **does not render a "Close All" button** — only the Open Orders table has a "Cancel All"; a close-all button would need to be added if desired).

### `handleEditOrder(order)`

Only edits `type === 'LIMIT'` orders. Sets `editingOrder` + opens an edit-order modal which ultimately calls `useEditOrder` (cancels + recreates with TIF=ALO).

---

## 5. Position derivation (raw → display) — `displayPositions`

In `trade/page.tsx`, `apiPositions` (raw) are mapped to `Position[]`. Key computations (reproduce to match):

```ts
const priceDiff = side === 'LONG' ? markPrice - entryPrice : entryPrice - markPrice;
const unrealizedPnl = priceDiff * sizeInToken;
const unrealizedPnlPercent = margin > 0 ? (unrealizedPnl / margin) * 100 : 0; // ROE
// liq price: prefer API liq price; else Pacifica formula:
//   liq = [entry - side*positionMargin/size] / (1 - side/maxLev/2)   (side = +1 LONG / -1 SHORT)
id: `${pos.symbol}-${pos.side}`,          // "BTC-USD-LONG"
size: sizeInToken * markPrice,            // USD value at mark
marginType: isolated ? 'Isolated' : 'Cross',
```

### TP/SL attachment (the tricky part)

For each position, the code scans `openOrders` for matching closing orders (opposite side, same symbol) and builds `tpOrders`/`slOrders`:

- **TP** = native order whose type includes `TP`/`take_profit`, **or** a `reduce_only` LIMIT order on the opposite side priced *beyond entry in the profit direction* (LONG → price > entry; SHORT → price < entry).
- **SL** = native order type includes `SL`/`stop_loss`, **or** a `reduce_only` STOP order on the opposite side *beyond entry in the loss direction* (LONG → trigger < entry; SHORT → trigger > entry).
- Each mapped to `TpSlOrder { orderId: order.id, type, triggerPrice: parseFloat(stopPrice||price), amount: parseFloat(size), orderType: type.includes('MARKET')?'market':'limit', limitPrice }`.
- Legacy `takeProfit = tpOrders[0]?.triggerPrice`, `stopLoss = slOrders[0]?.triggerPrice`.

This "hybrid TP/SL" detection is necessary because Pacifica partial TP/SL are implemented as reduce-only limit/stop orders rather than native TP/SL fields.

---

## 6. Hooks reference

### `usePositions.ts`

| Hook | Endpoint / source | Key behavior |
|------|-------------------|--------------|
| `usePositions()` | `PacificaAPI.getPositions(account)` | **WS-first**: if `usePacificaWsStore` connected and has positions, returns mapped WS positions (`{symbol,side,amount,entry_price,margin,funding,isolated,liq_price,updated_at}`), `isLoading:false`. HTTP polling is fallback: `refetchInterval` 30s (WS) / 15s (no WS). `enabled: connected && !!publicKey`. Query key `['positions', pubkey]`. |
| `useAccountInfo()` | `getAccountInfo(account)` | poll 15s, key `['account', pubkey]`. |
| `useAccountSettings()` | `getAccountSettings(account)` | per-symbol leverage; poll 30s, key `['account-settings', pubkey]`. |
| `useOpenOrders(symbol?)` | `getOpenOrders(account, symbol)` | **WS + HTTP merge** by `order_id`: WS provides realtime, HTTP fills missing `stop_price` and brand-new orders. Key `['orders', pubkey, symbol]`. |
| `useMarkets()` / `useMarket(symbol)` | `getMarkets()` | 60s cache. |
| `useTradeHistory(symbol?)` | `getTradeHistory` (infinite, cursor) | flattens pages + merges WS trades. |
| `useOrderHistory(symbol?)` | `getOrderHistory` | poll 30s. |

All read hooks gate on `useWallet()` `connected && publicKey` and key queries by `publicKey.toBase58()`.

### `useOrders.ts` — mutations used by these panels

| Hook | Endpoint | Used by |
|------|----------|---------|
| `useCreateMarketOrder()` | `POST /api/orders` (`type:'MARKET'`) | market close, flip, close-all, quick modal |
| `useCreateLimitOrder()` | `POST /api/orders` (`type:'LIMIT'`) | limit close, quick modal limit close |
| `useCancelOrder()` | `DELETE /api/orders/{id}?account&symbol&signature&timestamp` | cancel regular order |
| `useCancelStopOrder()` | `POST /api/orders/stop/cancel` | cancel/remove TP·SL·STOP |
| `useCancelAllOrders()` | `DELETE /api/orders?account&signature&timestamp[&symbol]` | "Cancel All" |
| `useSetPositionTpSl()` | `POST /api/positions/tpsl` | full-position TP/SL |
| `useCreateStopOrder()` | `POST /api/orders` (TP via reduce-only LIMIT) **or** `POST /api/orders/stop/create` (SL) | partial TP/SL |
| `useEditOrder()` | `POST /api/orders/edit` | edit limit price/size (cancel+recreate, TIF=ALO) |
| `useSetLeverage()` / `useSetMarginMode()` | `POST /api/account/leverage` · `/margin` | leverage/margin (not in these panels but same module) |
| `useBatchOrders()` | `POST /api/orders/batch` | up to 10 actions |
| `useWithdraw()` | `POST /api/account/withdraw` | account |

**Signing pattern (Pacifica — client-side):** every mutation first signs with the wallet via `createSigned*` from `@/lib/pacifica/signing`, producing `{ signature, timestamp }` that are sent in the request body/query. Account address = `wallet.publicKey.toBase58()`. `BUILDER_CODE = process.env.NEXT_PUBLIC_PACIFICA_BUILDER_CODE || 'TradeClub'` is attached to orders.

**Closing-side convention (in TP/SL & stop hooks):** position `LONG → ask`, `SHORT → bid` (order must be opposite to close). For TP, a reduce-only **limit** order is used (Pacifica stop orders only trigger against you); for SL, a stop order.

**Query invalidation on success:** market/limit/cancel/TP-SL all invalidate `['orders']`, `['positions']`, `['account']` (with staggered `setTimeout` refetches 300ms–3s later because Pacifica creates TP/SL stop orders asynchronously after the main order). Notifications go through `notify(...)` from `@/lib/notify`.

---

## 7. Open Orders table (inline in `trade/page.tsx`)

Data source: `openOrders` from `useAccount()` (which wraps `useOpenOrders`). Mapped `OpenOrder` shape:

```ts
{
  id: string;          // order_id as string
  symbol: string;      // "BTC-USD" or "BTC"
  side: 'LONG' | 'SHORT';   // mapped from bid/ask (bid→LONG, ask→SHORT)
  type: string;        // 'LIMIT' | 'TP MARKET' | 'SL MARKET' | 'TP LIMIT' | 'SL LIMIT' | 'STOP_MARKET' | ...
  size: string;
  price: string;       // for TP/SL = stop_price
  filled: string;
  status: 'OPEN' | 'REDUCE_ONLY';
  reduceOnly: boolean;
  stopPrice: string | null;
  createdAt: number;
}
```

Desktop columns: **Time, Order Type, Token, Side, Original Size, Filled Size, Price, Order Value, Reduce Only, Trigger, [Cancel All]**. Sortable via `ordersSort` (cols: `time,type,token,side,originalSize,filledSize,price,value,reduceOnly,trigger`).

Per-row classification (drives label + edit affordance):
```ts
const isNativeTpSl = type.includes('TP') || type.includes('SL') || /take_profit|stop_loss/i.test(type);
const isHybridTp   = !isNativeTpSl && reduceOnly && type.toUpperCase() === 'LIMIT';
const isHybridSl   = !isNativeTpSl && reduceOnly && type.toUpperCase().includes('STOP');
const isTpSl       = isNativeTpSl || isHybridTp || isHybridSl;
```
- **Price cell:** for plain LIMIT orders it's a `<button>` → `handleEditOrder(...)` (pencil icon). TP/SL/STOP show `'Market'` or read-only price.
- **Cancel cell:** `<button onClick={() => handleCancelOrder(order.id, order.symbol, order.type)}>` — label `'Remove'` if `isTpSl` else `'Cancel'`.
- **Cancel All:** `cancelAllOrders.mutate({})` in the header.
- Empty state text differs in fight-only mode: `'No open orders during this fight'` vs `'No open orders'`.

The bottom panel is a tab strip: **Positions | Open Orders | Trade History | Order History** (`bottomTab` state). `<Positions>` is rendered under the Positions tab.

---

## 8. Quick positions (navbar) — `QuickPositionsBar.tsx`

Two exports, both **self-fetching** (use `usePositions`, `usePrices`, `useAccountSettings`) and both render `null` when loading or no positions:

- **`QuickPositionsBar`** — horizontal draggable carousel (`hidden lg:flex`, custom mouse-drag scroll). Each button shows `{symbolBase}` + side badge + `±{pnlPercent}%` + current price.
- **`QuickPositionsDropdown`** — `ViewListIcon` button → absolute dropdown list (closes on outside click). Same row content.

Both compute metrics via `calculatePositionMetrics({ position, markPrice, leverage })` from `@/lib/trading/utils`, where `markPrice = getPrice(\`${base}-USD\`)?.price ?? parseFloat(entry_price)` and `leverage = leverageMap[base] || MAX_LEVERAGE[base] || 10`. **`MAX_LEVERAGE` is a hard-coded per-symbol map** (≈60 symbols) duplicated here from `useAccount.ts`; `leverageMap` is built from `useAccountSettings`. `formatQuickPrice` renders compact prices (`12.3K`, `1,234`, `0.1234`).

Clicking a row opens `<QuickPositionModal position isOpen onClose>`.

---

## 9. Quick position modal — `QuickPositionModal.tsx`

Bottom-sheet (mobile) / centered (desktop) modal with 4 tabs: **close (Market) | limit | tpsl | flip**. Consumes the **raw** WS `Position`. Calls mutations directly (`useCreateMarketOrder`, `useCreateLimitOrder`, `useSetPositionTpSl`) — it does **not** use the `<Positions>` callback props.

| Tab | Action | Mutation call |
|-----|--------|---------------|
| close | percentage slider (25/50/75/100 + slider) → `closeAmountTokens = roundToLotSize(positionSize*pct/100)` | `createMarketOrder({ symbol, side: isLong?'ask':'bid', amount: formatAmount(closeAmountTokens), reduceOnly:true, slippage_percent:'1' })` |
| limit | price + amount (with `floorToLotSize`, % buttons, est. PnL) | `createLimitOrder({ symbol: base, side: isLong?'ask':'bid', amount, price, reduceOnly:true })` |
| tpsl | TP & SL price inputs + % buttons (`calculateTpPrice`/`calculateSlPrice`, `roundToTickSize`) | `setTpSl({ symbol, side: isLong?'LONG':'SHORT', size: position.amount, take_profit, stop_loss })` (null when blank) |
| flip | confirmation card | `createMarketOrder({ symbol, side: isLong?'ask':'bid', amount: (positionSize*2).toString(), reduceOnly:false, slippage_percent:'1' })` |

Metrics again from `calculatePositionMetrics`. Footer of each tab also has a **"Go to Terminal"** button → `window.location.href = \`/trade?symbol=${base}\``. Form resets on open transition (`wasOpen` guard). Lot/tick come from `priceData.lotSize ?? 0.00001` / `priceData.tickSize ?? 0.01`.

---

## 10. Fight (game-layer) boundary — what to strip

The terminal positions/orders code is **almost** fight-free; the entanglements are concentrated in `trade/page.tsx`, not in `Positions.tsx`/`QuickPosition*`:

| Where | Fight coupling | Strip action |
|-------|----------------|--------------|
| `Positions.tsx` props `readOnly`/`readOnlyMessage` | Used to render fight positions read-only (no close buttons). | Optional: drop both props; always show Close column. Component is otherwise fight-agnostic. |
| `trade/page.tsx` `displayFightPositions` | A *separate* mapping of fight-only positions (`fightPositions`) → `Position[]` (`liquidationPrice:0`, no TP/SL). **Fight-only.** | Exclude. |
| `trade/page.tsx` `activePositions / activeTrades / activeOpenOrders / activeOrderHistory` | `showFightOnly && fightId ? fightFiltered… : …` toggle (+ the "All / Fight Only" segmented control near line 1828). | Replace with the plain `displayPositions` / `openOrders` / `tradeHistory` / `orderHistory`. |
| `trade/page.tsx` `fightFilteredPositions`, `fightPnl/fightMargin/fightRoi`, `blockedSymbols` | Fight PnL/ROE aggregation + pre-fight symbol blocking. | Exclude. |
| `handleClosePosition` flip branch | `isPreFightFlip`, `inActiveFight`, `fightId`, `fightPositions` used to decide whether to record a fight trade. | Remove `fightId`/`isPreFightFlip`/`isPreFightPosition`; flip is otherwise a normal 2× reduce-off market order. |
| `useOrders.ts` mutations | Optional `fightId`/`leverage`/`isPreFightFlip` params and `fight-positions`/`fight-trades`/`fight-orders`/`stake-info` query invalidations in `onSuccess`. | Drop the `fight*` params and the fight query invalidations; keep the `['orders']`/`['positions']`/`['account']` invalidations. |
| `useFightPositions` hook | **Fight-only** (not in scope). The account-position equivalent is `usePositions`. | Do not migrate; use `usePositions`. |

The empty-state strings `'No open orders during this fight'` and the `setShowFightOnly` toggle are the only fight strings inside the order/position table JSX.

---

## 11. Migration checklist

1. Port `Position`/`TpSlOrder`/`PositionsProps` types and `Positions.tsx` verbatim (drop `readOnly` if no fight layer).
2. Port `usePositions` + `useOpenOrders` (Pacifica WS-first + HTTP fallback) and the `useAccount`-style `OpenOrder` mapping.
3. Port `useOrders.ts` mutations; remove `fight*` params + invalidations.
4. Re-implement the 4 callbacks (`handleClosePosition`, `handleCancelOrder`, `handleSetTpSl`, `handleCloseAllPositions`) plus `displayPositions` mapping (incl. hybrid TP/SL detection) in the host page.
5. Extract the inline Open Orders table from `trade/page.tsx` into a component (data shape + handlers above).
6. Provide `@/lib/trading/utils` (`calculatePositionMetrics`, `calculateTpPrice`, `calculateSlPrice`, `roundToLotSize`, `roundToTickSize`, `formatPrice`, `PositionInfo`), `@/lib/notify`, `@/lib/pacifica/signing`, `@/lib/pacifica/api-client`, and the `usePrices` / `usePacificaWebSocket` stores.
7. Confirm Tailwind tokens (`surface-*`, `win-*`, `loss-*`) exist — see [Design tokens](./02-design-tokens-css.md).
