# Order Book

Part of the Trading Terminal Migration set — see [README](./README.md).

The order book is a self-contained, real-time depth display. It streams aggregated book data **directly from Pacifica's public WebSocket** (no backend involvement, no auth) and renders up to 10 levels per side with cumulative-size depth bars, a spread row, and a buy/sell ratio bar. It has **zero fight/duel coupling** — it can be lifted into a new repo almost verbatim.

Source files:

| File | Lines | Role |
|------|-------|------|
| `apps/web/src/components/OrderBook.tsx` | 302 | Presentational component + all formatters |
| `apps/web/src/hooks/useOrderBook.ts` | 183 | Pacifica WebSocket subscription hook |
| `apps/web/src/components/Dropdown.tsx` | 88 | Shared dropdown used for agg-level + size-mode selectors |

Related docs: [Design tokens & CSS](./02-design-tokens-css.md), [Order entry](./07-order-entry.md), [Market data hooks](./05-market-data.md).

---

## 1. Component API (`OrderBook`)

```ts
interface OrderBookProps {
  symbol: string;             // app symbol format, e.g. "BTC-USD"
  currentPrice: number;       // used only to pick size decimals (isHighValueToken = currentPrice >= 10)
  oraclePrice?: number;       // accepted in props but UNUSED in the body
  tickSize?: number;          // default 0.01 — drives the agg-level dropdown labels
  onPriceClick?: (price: number) => void; // click-to-fill callback (price of the clicked row)
}
```

> Note: the destructure on line 97 is `{ symbol, currentPrice, tickSize = 0.01, onPriceClick }` — `oraclePrice` is declared in the interface but **never read**. Safe to drop on migration.

### Call sites (for reference)

From `apps/web/src/app/trade/page.tsx` (both desktop + mobile panels):

```tsx
<OrderBook
  symbol={selectedMarket}     // "BTC-USD"
  currentPrice={currentPrice}
  oraclePrice={currentPrice}
  tickSize={tickSize}
/>
```

`onPriceClick` is **not** wired up at the current trade-page call sites, but the prop exists so the migrator can connect it to the order-entry price field (see Click-to-fill below).

---

## 2. Data source — Pacifica WebSocket (NOT polling, NOT a backend API)

The depth data comes from the `useOrderBook` hook, which opens a raw browser `WebSocket` straight to Pacifica:

```ts
const PACIFICA_WS_URL = 'wss://ws.pacifica.fi/ws';
```

There is **no REST polling, no refresh interval, and no backend route**. Updates are push-based — the component re-renders whenever Pacifica emits a new `book` snapshot. Cadence is entirely server-driven by Pacifica.

### Hook signature and return

```ts
export type AggLevel = 1 | 10 | 100 | 1000 | 10000;

export function useOrderBook(symbol: string, aggLevel: AggLevel = 1): {
  orderBook: OrderBookData | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}
```

### Public types

```ts
export interface OrderBookLevel {
  price: number;
  size: number;
  orders: number;
}

export interface OrderBookData {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}
```

### Symbol mapping (app -> Pacifica)

The hook converts the app's `BASE-USD` symbol to Pacifica's bare-base symbol:

```ts
const symbolToPacifica = (symbol: string): string => {
  if (symbol === 'KPEPE-USD') return '1000PEPE';
  return symbol.replace('-USD', '');
};
```

> Inconsistency to be aware of: the **component** maps `KPEPE-USD -> "1KPEPE"` (its `getBaseToken`, used only for the size-mode dropdown label), while the **hook** maps `KPEPE-USD -> "1000PEPE"` (the actual WS symbol). These are independent — the component's `baseToken` is display-only; the hook's value is what gets subscribed. Preserve both verbatim when migrating.

### Subscribe / unsubscribe protocol

On `onopen` the hook subscribes; on cleanup it unsubscribes (if socket still OPEN) then closes:

```ts
// subscribe
ws.send(JSON.stringify({
  method: 'subscribe',
  params: { source: 'book', symbol: pacificaSymbol, agg_level: aggLevel }
}));

// unsubscribe (cleanup)
ws.send(JSON.stringify({
  method: 'unsubscribe',
  params: { source: 'book', symbol: pacificaSymbol, agg_level: aggLevel }
}));
```

`agg_level` is a **server-side aggregation multiplier of the market tick size** (e.g. `tickSize=0.01`, `agg_level=10` -> 0.10 grouping).

### Incoming message shape

Pacifica pushes a compact, single-letter-keyed message. The hook ignores anything where `channel !== 'book'` or the symbol does not match.

```ts
interface PacificaBookLevel { p: string; a: string; n: number; } // price, amount, #orders
interface PacificaBookMessage {
  channel: 'book';
  data: {
    s: string;                                  // symbol
    l: [PacificaBookLevel[], PacificaBookLevel[]]; // [bids, asks]
    t: number;                                  // timestamp
  };
}
```

Parsing (note `p`/`a` are **strings** -> `parseFloat`):

```ts
const [bidsRaw, asksRaw] = message.data.l;
const bids = bidsRaw.map(l => ({ price: parseFloat(l.p), size: parseFloat(l.a), orders: l.n }));
const asks = asksRaw.map(l => ({ price: parseFloat(l.p), size: parseFloat(l.a), orders: l.n }));
```

### Lifecycle / resilience behavior

| Concern | Behavior |
|---------|----------|
| Effect deps | `[symbol, aggLevel]` — re-subscribes (new socket) when either changes |
| State reset on dep change | `setOrderBook(null); setIsLoading(true); setIsConnected(false); setError(null)` |
| Reconnect | On `onclose`, reconnect after **3000 ms** via `setTimeout` (unless cancelled) |
| Cancellation | `isCancelled` flag guards every async callback; cleanup sets it true, clears reconnect timer, unsubscribes, closes |
| Error handling | `onerror` sets `error = 'Connection error'`; parse errors in `onmessage` are silently swallowed |
| `isLoading` | starts `true`, flips to `false` on first successful `book` message |

Migration note: this is a **per-component socket**. There is no shared/singleton WS manager here — mounting two OrderBooks opens two sockets. If the target repo already has a WS multiplexer, rewire `useOrderBook` to it; otherwise this hook is drop-in.

---

## 3. Data processing (in `OrderBook.tsx`)

All derived values are memoized on `[orderBook, sizeMode]`:

- Takes **`slice(0, 10)`** levels per side.
- Computes a **running cumulative total** per side (`askRunningTotal`, `bidRunningTotal`). In USD mode the per-level `displaySize = level.size * level.price`; in token mode `displaySize = level.size`.
- `maxTotal = Math.max(askRunningTotal, bidRunningTotal)` — the denominator for depth-bar widths.
- **Asks are reversed** (`asks.reverse()`) so the highest ask renders at the top, descending toward the spread.
- Spread:

```ts
const bestBid = orderBook.bids[0]?.price || 0;
const bestAsk = orderBook.asks[0]?.price || 0;
const spreadValue = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
const spreadPct   = bestBid > 0 ? (spreadValue / bestBid) * 100 : 0;
```

- Buy/sell ratio (rendered in the bottom bar):

```ts
const totalVolume = bidTotal + askTotal;
const buyPercent  = totalVolume > 0 ? (bidTotal / totalVolume) * 100 : 50;
const sellPercent = totalVolume > 0 ? (askTotal / totalVolume) * 100 : 50;
```

---

## 4. Controls / local state

| State | Type | Default | Purpose |
|-------|------|---------|---------|
| `aggLevel` | `AggLevel` | `1` | server-side aggregation; passed to `useOrderBook` |
| `sizeMode` | `'USD' \| 'TOKEN'` | `'TOKEN'` | toggles size/total column units |

`isHighValueToken = currentPrice >= 10` — selects size decimal precision.

### Agg-level dropdown

```ts
const AGG_LEVELS: AggLevel[] = [1, 10, 100, 1000, 10000];
// option labels = formatTickValue(tickSize * level)
```

`formatTickValue` strips trailing zeros; for `value >= 1` it is `toFixed(0)`, otherwise `toFixed(8)` with trailing zeros trimmed. So with `tickSize=0.01` the dropdown shows: `0.01, 0.1, 1, 10, 100`.

Both selectors use the shared **`Dropdown`** component:

```ts
interface DropdownProps<T extends string | number = string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  align?: 'left' | 'right';   // size-mode dropdown uses align="right"
  className?: string;
}
```

`Dropdown` closes on outside `mousedown`, renders a chevron that rotates when open, and shows a check next to the selected option. Menu classes: `bg-surface-850 rounded-lg shadow-xl z-50`. Trigger classes: `text-surface-300 hover:text-white hover:bg-surface-800`.

---

## 5. Formatters (copy verbatim)

| Fn | Rule |
|----|------|
| `getBaseToken(symbol)` | `KPEPE-USD -> "1KPEPE"`, else strip `-USD`. **Display label only.** |
| `formatPrice(price)` | Decimals by magnitude: `>=1000 -> 0`, `>=100 -> 1`, `>=10 -> 2`, `>=1 -> 3`, `>=0.1 -> 4`, `>=0.01 -> 5`, `>=0.001 -> 6`, else `8`. Uses `toLocaleString('en-US')` (commas). |
| `formatSize(size, isUsdMode, isHighValueToken=true)` | USD mode -> always 2 decimals. Token + high-value -> 5 decimals. Token + memecoin -> 0 / 2 / 5 decimals by magnitude. `0 -> "0.00"`. |
| `formatTickValue(value)` | agg-level labels (see above). |

---

## 6. Depth rendering and layout

The component is a vertical flex column, `text-xs`, with `style={{ contain: 'layout' }}` for paint stability. Structure top->bottom:

1. **Header row** (`flex-shrink-0`, agg-level dropdown left, size-mode dropdown right).
2. **Column headers** — `grid grid-cols-2 sm:grid-cols-3`, `text-[10px] text-surface-400 uppercase`. The middle "Size(...)" column is `hidden sm:block` (hidden on narrow screens).
3. **Asks block** (`flex-1 flex flex-col justify-end`). Empty placeholder rows (`Array(10 - processedAsks.length)`) keep the layout from jumping when fewer than 10 levels arrive.
4. **Spread row** (`flex-shrink-0`, `bg-surface-800/30`).
5. **Bids block** (`flex-1 flex flex-col`), with trailing placeholder rows.
6. **Buy/Sell ratio bar** (`flex-shrink-0`, `border-t border-surface-800`).

### A single ask/bid row

```tsx
<div
  key={`ask-${level.price}`}
  className="relative flex-1 min-h-[28px] grid grid-cols-2 sm:grid-cols-3 text-xs px-2 cursor-pointer hover:bg-surface-700/30 items-center"
  onClick={() => onPriceClick?.(level.price)}
>
  {/* cumulative-size depth bar */}
  <div
    className="absolute inset-y-0 right-0 bg-gradient-to-l from-loss-500/30 to-loss-600/10 transition-[width] duration-300 ease-out"
    style={{ width: `${(level.total / maxTotal) * 100}%` }}
  />
  <span className="relative text-loss-400 tabular-nums tracking-tight">{formatPrice(level.price)}</span>
  <span className="relative hidden sm:block text-right text-surface-200 tabular-nums tracking-tight">
    {formatSize(level.displaySize, sizeMode === 'USD', isHighValueToken)}
  </span>
  <span className="relative text-right text-surface-200 tabular-nums tracking-tight">
    {formatSize(level.total, sizeMode === 'USD', isHighValueToken)}
  </span>
</div>
```

Bid rows are identical except the gradient is `from-win-500/30 to-win-600/10` and the price text is `text-win-400`.

### Cumulative-size depth bars

- Each row has an `absolute inset-y-0 right-0` gradient `<div>` whose **width** = `(level.total / maxTotal) * 100 %` — i.e. proportional to the **cumulative** total at that level, not the per-level size.
- Bars grow **right-to-left** (`bg-gradient-to-l`, anchored `right-0`).
- Asks: red gradient (`loss-500/30 -> loss-600/10`). Bids: green gradient (`win-500/30 -> win-600/10`).
- Width transitions with `transition-[width] duration-300 ease-out`.
- Numeric content sits in `relative` spans so it paints **above** the absolute bar.

### Spread display

```tsx
<div className="flex-shrink-0 px-2 py-1 border-surface-800 bg-surface-800/30 flex justify-between text-[10px] text-surface-400">
  <span>Spread</span>
  <span className="tabular-nums tracking-tight">{spread > 0 ? formatPrice(spread) : '-'}</span>
  <span className="tabular-nums tracking-tight">{spread > 0 ? spreadPercent.toFixed(3) + '%' : '-'}</span>
</div>
```

Shows absolute spread (via `formatPrice`) and percent to 3 decimals; both render `-` when spread is 0.

### Buy/Sell ratio bar

Two side-by-side gradient divs widthed by `buyPercent` / `sellPercent`, each with an embedded label:

```tsx
<div className="flex-shrink-0 py-1.5 border-t border-surface-800">
  <div className="relative h-5 flex overflow-hidden">
    <div className="h-full flex items-center bg-gradient-to-r from-win-500/30 to-win-600/10 transition-all duration-500 ease-out"
         style={{ width: `${buyPercent}%` }}>
      <span className="pl-1.5 text-[10px] text-win-400 font-semibold tabular-nums whitespace-nowrap">B {buyPercent.toFixed(0)}%</span>
    </div>
    <div className="h-full flex items-center justify-end bg-gradient-to-l from-loss-500/30 to-loss-600/10 transition-all duration-500 ease-out"
         style={{ width: `${sellPercent}%` }}>
      <span className="pr-1.5 text-[10px] text-loss-400 font-semibold tabular-nums whitespace-nowrap">{sellPercent.toFixed(0)}% S</span>
    </div>
  </div>
</div>
```

---

## 7. Click-to-fill behavior

Every price row has `onClick={() => onPriceClick?.(level.price)}` and `cursor-pointer`, plus `hover:bg-surface-700/30`. Clicking any level invokes the parent callback with the **raw level price** (a `number`). The component does no filling itself — the parent (order-entry form) is expected to set its limit-price field. At the current trade-page call sites this prop is **not passed**, so wiring it to the order form is a migration to-do.

---

## 8. Loading / empty states

```tsx
if (isLoading && !orderBook) // -> centered "Loading order book..." (text-surface-400 text-sm)
if (!orderBook || (processedAsks.length === 0 && processedBids.length === 0)) // -> "No order book data"
```

Both wrappers: `h-full flex items-center justify-center`.

---

## 9. Styling class inventory (Tailwind tokens used)

| Token | Where |
|-------|-------|
| `surface-200/300/400/500/700/800/850` | text, borders, hover, dropdown menu |
| `surface-700/30`, `surface-800/30` | row hover, spread bg |
| `loss-400/500/600` | ask price text + ask depth/sell gradients |
| `win-400/500/600` | bid price text + bid depth/buy gradients |
| `tabular-nums tracking-tight` | all numeric cells (stable digit width) |
| `text-[10px]`, `text-xs` | headers / body |
| `min-h-[28px]`, `flex-1`, `contain: layout` | row sizing and layout stability |

These all come from the shared design system — see [Design tokens & CSS](./02-design-tokens-css.md) for the actual hex values of `surface-*`, `win-*`, `loss-*`.

---

## 10. Migration checklist

1. Copy `useOrderBook.ts` and `OrderBook.tsx` (+ `Dropdown.tsx`) verbatim.
2. Ensure the target repo's symbol format is `BASE-USD`; otherwise adjust `symbolToPacifica` and `getBaseToken`.
3. Confirm `surface-*`, `win-*`, `loss-*` Tailwind colors exist (port from design tokens).
4. Decide whether to keep the per-component raw WebSocket or route through an existing WS manager.
5. Wire `onPriceClick` to the order-entry price input (not currently connected).
6. Drop the unused `oraclePrice` prop or wire it intentionally.
7. No backend, no auth, no env vars required for the book itself — Pacifica's public WS is hardcoded.
