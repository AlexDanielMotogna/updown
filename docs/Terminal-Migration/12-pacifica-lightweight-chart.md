# Pacifica Lightweight-Charts Chart

Part of the Trading Terminal Migration set — see [README](./README.md).

This documents `PacificaChart`, the **self-hosted candlestick chart** built on the
[`lightweight-charts`](https://www.npmjs.com/package/lightweight-charts) npm package (TradingView's
open-source library). It is the alternative/fallback to the hosted **TradingView Advanced widget**
documented in [11 – TradingView chart](./11-tradingview-chart.md). Both render the same Pacifica
market data; they differ only in rendering engine, feature set, and licensing.

| | `PacificaChart` (this doc) | `TradingViewChartAdvanced` (doc 11) |
|---|---|---|
| Package | `lightweight-charts` ^5.1.0 (MIT) | TradingView Charting Library / hosted widget |
| Data source | `useCandles` → `/api/chart/candles` + Pacifica WS | TradingView datafeed / same backend |
| Bundle weight | Tiny (~45 KB) | Heavy iframe / external script |
| Drawing tools | Single horizontal-line tool, built in-house | Full TradingView toolset |
| Currently wired into `trade/page.tsx`? | **No** (exported component, not mounted) | **Yes** (active production chart) |
| Use when | No TV license, lightweight embeds, mobile-first, full control of theming/data | Production trade page, rich studies/drawings |

> **Migration note:** As of this snapshot `PacificaChart` is defined and self-contained but is **not
> imported by any page** (`apps/web/src/app/trade/page.tsx` mounts `TradingViewChartAdvanced`
> instead, and `PacificaChart` is **not** re-exported from `apps/web/src/components/index.ts`).
> Treat it as a ready-to-drop-in fallback. It has **zero fight/duel coupling** — see
> [Fight entanglement](#fight-entanglement).

---

## File

`apps/web/src/components/PacificaChart.tsx` (553 lines). Default-exported as a `memo`-wrapped
component:

```tsx
export const PacificaChart = memo(PacificaChartComponent);
```

`'use client'` — must run in the browser (creates a DOM chart, opens a WebSocket).

### Dependencies

| Import | From | Purpose |
|---|---|---|
| `createChart`, `ColorType`, `CandlestickSeries`, `HistogramSeries` (values) | `lightweight-charts` | chart + v5 series factories |
| `IChartApi`, `ISeriesApi`, `CandlestickData`, `HistogramData`, `Time`, `MouseEventParams`, `IPriceLine` (types) | `lightweight-charts` | typing |
| `useCandles` | `@/hooks/useCandles` | historical + realtime kline data (see [Data](#data-source-usecandles)) |
| `Spinner` | `./Spinner` | loading overlay |

Tailwind utility classes use the app design tokens (`surface-*`, `primary-*`, `win-*`, `loss-*`) —
see [02 – Design tokens](./02-design-tokens-css.md).

---

## Props

```ts
interface PacificaChartProps {
  symbol: string;                  // app symbol, e.g. "BTC-USD" (passed straight to useCandles)
  interval?: '1m'|'3m'|'5m'|'15m'|'30m'|'1h'|'2h'|'4h'|'8h'|'12h'|'1d'; // default '5m'
  height?: number;                 // px, default 400
  entryPrice?: number;             // draws a dashed "Entry" price line (indigo)
  takeProfit?: number;             // draws a dashed "TP" price line (teal)
  stopLoss?: number;               // draws a dashed "SL" price line (coral)
}
```

`entryPrice` / `takeProfit` / `stopLoss` are the only place position context enters the chart.
They are **plain numbers** — the caller (the trade page / Positions panel) computes them. They are
*not* fight-specific; any position has an entry/TP/SL.

---

## Component anatomy

The component is a single function with several `useEffect`s, each owning one concern. Refs hold the
imperative chart objects so effects can coordinate without re-creating the chart.

```ts
const containerRef       = useRef<HTMLDivElement>(null);          // chart mount node
const chartRef           = useRef<IChartApi | null>(null);
const candleSeriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);
const volumeSeriesRef    = useRef<ISeriesApi<'Histogram'> | null>(null);
const hasInitiallyScrolled = useRef(false);                        // scroll-to-latest once
const userPriceLinesRef  = useRef<Map<string, IPriceLine>>(new Map()); // hand-drawn hlines
const positionPriceLinesRef = useRef<IPriceLine[]>([]);           // Entry/TP/SL lines
const previewLineRef     = useRef<IPriceLine | null>(null);
```

Local UI state: `isMobile`, `activeTool` (`'cursor' | 'hline'`), `horizontalLines[]`,
`previewPrice`, and `crosshairData` (OHLCV readout under the crosshair).

### Effects (in file order)

| Effect deps | Responsibility |
|---|---|
| `[]` (mount) | mobile detection via `window.innerWidth < 1024 \|\| 'ontouchstart' in window` |
| `[height, isMobile]` | **create chart + series**, crosshair subscription, resize listener, cleanup (`chart.remove()`) |
| `[candleData, volumeData]` | `setData(...)` on both series; scroll-to-latest once |
| `[symbol, interval]` | reset `hasInitiallyScrolled` so a new market re-scrolls |
| `[entryPrice, takeProfit, stopLoss]` | rebuild position price lines |
| `[horizontalLines]` | diff & sync user-drawn horizontal price lines |
| `[loadMoreHistory, isLoadingMore]` | infinite-scroll: load older candles when scrolled near left edge |

> Because the create-chart effect depends on `[height, isMobile]`, the chart is **destroyed and
> rebuilt** whenever height or the mobile flag changes. This is intentional (mobile changes touch
> handling) but means series refs are repopulated; data is re-applied by the data effect.

---

## Chart + series creation

Created in the `[height, isMobile]` effect. Reproduced verbatim — these are the exact theme values
to copy:

```ts
const chart = createChart(containerRef.current, {
  width: containerRef.current.clientWidth,
  height: height,
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: '#9ca3af',                                  // surface-400 grey
  },
  grid: {
    vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
    horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
  },
  crosshair: {
    mode: 1, // Normal
    vertLine: { color: '#6366f1', labelBackgroundColor: '#6366f1' }, // indigo / primary-500
    horzLine: { color: '#6366f1', labelBackgroundColor: '#6366f1' },
  },
  rightPriceScale: {
    borderColor: 'rgba(255, 255, 255, 0.1)',
    scaleMargins: { top: 0.1, bottom: 0.2 },               // leave 20% bottom for volume
  },
  timeScale: {
    borderColor: 'rgba(255, 255, 255, 0.1)',
    timeVisible: true,
    secondsVisible: false,
    rightOffset: 12,
    barSpacing: 6,
    minBarSpacing: 2,
  },
  handleScroll: {
    mouseWheel: true,
    pressedMouseMove: true,
    horzTouchDrag: true,
    vertTouchDrag: !isMobile,        // disable vertical touch drag on mobile (page scroll wins)
  },
  handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
});
```

### Candlestick series (v5 API)

> **lightweight-charts v5** uses `chart.addSeries(SeriesDefinition, options)` with imported series
> classes (`CandlestickSeries`, `HistogramSeries`). This **replaces** the v3/v4
> `chart.addCandlestickSeries(...)` / `chart.addHistogramSeries(...)` methods. Do not mix APIs.

```ts
const candlestickSeries = chart.addSeries(CandlestickSeries, {
  upColor:       '#26A69A',   // teal  (bullish)
  downColor:     '#EF5350',   // coral (bearish)
  borderUpColor: '#26A69A',
  borderDownColor: '#EF5350',
  wickUpColor:   '#26A69A',
  wickDownColor: '#EF5350',
});
```

### Volume series (overlay histogram)

```ts
const volumeSeries = chart.addSeries(HistogramSeries, {
  priceFormat: { type: 'volume' },
  priceScaleId: '',                                  // '' = overlay on the main pane
});
volumeSeries.priceScale().applyOptions({
  scaleMargins: { top: 0.8, bottom: 0 },             // histogram occupies bottom 20%
});
```

Per-bar volume color is set in the data mapping (not series options):

```ts
color: candle.close >= candle.open
  ? 'rgba(38, 166, 154, 0.5)'   // teal  @50% (bullish)
  : 'rgba(239, 83, 80, 0.5)',   // coral @50% (bearish)
```

### Color reference

| Token | Hex / rgba | Used for |
|---|---|---|
| Bullish | `#26A69A` (teal) | up candles/wicks/borders, TP line, volume(+) `rgba(38,166,154,0.5)` |
| Bearish | `#EF5350` (coral) | down candles/wicks/borders, SL line, volume(−) `rgba(239,83,80,0.5)` |
| Crosshair / Entry / primary | `#6366f1` (indigo, `primary-500`) | crosshair lines+labels, Entry price line |
| Axis text | `#9ca3af` (`surface-400`) | layout `textColor` |
| Grid lines | `rgba(255,255,255,0.05)` | vert/horz grid |
| Scale borders | `rgba(255,255,255,0.1)` | price/time scale borders |
| User hline | `#f59e0b` (amber) | hand-drawn horizontal lines |

---

## Data source: `useCandles`

`PacificaChart` is intentionally thin; **all data lifecycle lives in
`apps/web/src/hooks/useCandles.ts`**. The chart just maps the hook output into series data.

```ts
const { candles, isConnected, isLoading, isLoadingMore, loadMoreHistory } =
  useCandles(symbol, interval);
```

Hook return shape:

```ts
{
  candles: CandleData[];      // sorted ascending by time
  isConnected: boolean;       // WS connected (drives Live/Connecting dot)
  isLoading: boolean;         // initial history fetch in flight
  isLoadingMore: boolean;     // infinite-scroll fetch in flight
  loadMoreHistory: () => Promise<void>;
  error: string | null;
}
```

`CandleData` (note: `time` is **Unix seconds**, the unit lightweight-charts expects):

```ts
export interface CandleData {
  time: number;   // Unix timestamp in SECONDS
  open: number; high: number; low: number; close: number; volume: number;
}
```

### Historical load (REST)

On `[symbol, interval]` change the hook resets state then fetches an aggregated backend endpoint:

```
GET /api/chart/candles?symbol={SYMBOL-USD}&interval={interval}&start={ms}&end={ms}
```

- `start`/`end` are **milliseconds**. Initial window depth varies by interval via `getInitialDays`
  (`1m`→1 day … `1d`→730 days).
- Response shape (`ChartApiResponse`):

```ts
{
  success: boolean;
  data: Array<{ t:number; o:number; h:number; l:number; c:number; v:number }>; // t = ms
  meta?: { symbol; interval; startTime; endTime; count };
}
```

- `parseChartApiData` converts `t` ms → seconds (`Math.floor(c.t/1000)`) and passes OHLCV straight
  through (already numbers).
- Backend route: `apps/web/src/app/api/chart/candles/route.ts` — **multi-source aggregator**:
  Pacifica (primary, June 2025+) → Binance Futures → Bybit → CoinGecko (daily fallback). Contains a
  `SYMBOL_MAP` of ~30 markets mapping app symbol → `{ pacifica, binance, bybit, coingecko }` IDs.
  This is shared infrastructure (the TradingView datafeed can use the same endpoint).

### Realtime updates (WebSocket)

The hook opens `wss://ws.pacifica.fi/ws` directly (constant `PACIFICA_WS_URL`) and subscribes:

```jsonc
{ "method": "subscribe",
  "params": { "source": "candle", "symbol": "BTC", "interval": "5m" } }
```

- App symbol → Pacifica symbol via `symbolToPacifica`: strip `-USD`; special-case
  `KPEPE-USD` → `1000PEPE`.
- Incoming `{ channel: 'candle', data: {...} }` messages (string OHLCV, ms `t`) are filtered by
  symbol+interval, converted to `CandleData`, then merged into `candles`:
  - same `time` as last → **replace** last (live updating bar),
  - newer `time` → **append** (new bar),
  - else find-and-replace by `time`.
- Auto-reconnect: on `onclose`, retry after **3000 ms**. `isCancelled` guard prevents stale updates
  after unmount / symbol change.

### Applying data to the chart

`PacificaChart` memoizes a transform of `candles` → two arrays, deduplicating by timestamp (a `Map`
keyed on `time` keeps the last occurrence) and re-sorting ascending:

```ts
const { candleData, volumeData } = useMemo(() => { ... }, [candles]);
```

then, in the `[candleData, volumeData]` effect:

```ts
candleSeriesRef.current.setData(candleData);   // CandlestickData<Time>[]
volumeSeriesRef.current.setData(volumeData);   // HistogramData<Time>[]
if (!hasInitiallyScrolled.current && candleData.length > 0) {
  chartRef.current.timeScale().scrollToPosition(5, false); // show latest with small right gap
  hasInitiallyScrolled.current = true;
}
```

> The component uses **`setData` (full replace) on every change**, not the incremental
> `series.update(bar)`. Because `useCandles` already maintains the merged array and dedup is cheap,
> this is correct but re-applies the whole dataset each tick. A migrator optimizing for very long
> histories could switch the realtime path to `series.update(latestBar)` and keep `setData` only for
> the initial/history-prepend cases.

### Infinite scroll (load older history)

```ts
chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
  const r = chart.timeScale().getVisibleLogicalRange();
  if (r !== null && r.from < 50 && !isLoadingMore) loadMoreHistory();
});
```

`loadMoreHistory` fetches **200 older candles** ending just before `oldestTimestamp` from the same
`/api/chart/candles` endpoint, prepends + re-sorts. Symbol/interval are re-checked after each await
to drop responses for a stale market.

---

## Resize handling

Inside the create-chart effect:

```ts
const handleResize = () => {
  if (containerRef.current && chartRef.current) {
    chartRef.current.applyOptions({
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || height,
    });
  }
};
window.addEventListener('resize', handleResize);
handleResize();                       // run once immediately
// cleanup: window.removeEventListener('resize', handleResize); chart.remove();
```

It listens to `window` `resize` only (no `ResizeObserver`), reading the container's measured size.
Container markup:

```tsx
<div ref={containerRef} className="w-full"
     style={{ height: `${height}px`,
              cursor: activeTool !== 'cursor' ? 'crosshair' : 'default',
              touchAction: isMobile ? 'pan-y' : 'auto' }}  // mobile: let page scroll win
     onClick={handleChartClick} />
```

> **Gap / improvement:** because resize is window-only, a chart inside a panel that resizes without
> a window resize (e.g. flex/grid layout reflow, splitter drag) won't re-fit. A `ResizeObserver` on
> `containerRef` is the standard fix in a fresh build.

---

## Overlays & drawing tools (built in-house)

### Position price lines (`[entryPrice, takeProfit, stopLoss]` effect)

Removes prior lines (tracked in `positionPriceLinesRef`), then for each defined prop calls
`series.createPriceLine({...})`:

| Prop | color | title | style |
|---|---|---|---|
| `entryPrice` | `#6366f1` | `Entry` | `lineStyle: 2` (dashed), `lineWidth: 1`, `axisLabelVisible: true` |
| `takeProfit` | `#26A69A` | `TP` | dashed |
| `stopLoss` | `#EF5350` | `SL` | dashed |

### User horizontal lines (`[horizontalLines]` effect)

State-driven diff against `userPriceLinesRef` (a `Map<id, IPriceLine>`): create newly added lines,
`series.removePriceLine(...)` ones no longer in state. New lines are created by the `hline` tool:

```ts
// handleChartClick: pixel → price via series.coordinateToPrice(y)
const newLine: HorizontalLine = {
  id: `hline-${Date.now()}`, price: priceCoord, color: '#f59e0b',
  lineWidth: 1, lineStyle: 0 /* solid */, label: `$${priceCoord.toFixed(2)}`,
};
```

`HorizontalLine` type:

```ts
interface HorizontalLine {
  id: string; price: number; color: string;
  lineWidth: 1|2|3|4; lineStyle: 0|1|2|3; // Solid|Dotted|Dashed|LargeDashed
  label: string;
}
```

Toolbar (top-right, `absolute top-2 right-2 z-10`): **Cursor**, **Horizontal Line**, **Clear All**
buttons (inline SVG icons, `surface-*`/`primary-*` styling). `clearAllDrawings` removes every user
line and empties state.

### Crosshair OHLCV readout

`chart.subscribeCrosshairMove(param => ...)` reads `param.seriesData.get(candlestickSeries)` and
`...get(volumeSeries)` to populate `crosshairData` (time string, OHLC, volume, abs+pct change vs
open). Rendered top-left (`absolute top-2 left-2`) when hovering; otherwise a **Live / Connecting**
status dot (`isConnected ? bg-win-400 : bg-loss-400`) and a "Loading more..." note show instead.
Helpers `formatPrice` (decimals scaled by magnitude) and `formatVolume` (`K/M/B`) format the values.

A `Spinner` overlay (`isLoading`) covers the chart during the initial history fetch.

---

## Fight entanglement

**None.** `PacificaChart.tsx` imports only `lightweight-charts`, `useCandles`, and `Spinner`. It has
no reference to fights, duels, arena, stakes, or any game state. The only externally-supplied values
(`entryPrice`/`takeProfit`/`stopLoss`) are generic position numbers passed by the caller. A migrator
can lift this file verbatim. The active production chart that *is* fight-aware lives elsewhere
(`TradingViewChartAdvanced` + the trade page) — see [doc 11](./11-tradingview-chart.md).

---

## Migration checklist

1. `npm i lightweight-charts@^5` (MIT — no key/license needed; contrast with TradingView).
2. Copy `apps/web/src/components/PacificaChart.tsx` and `apps/web/src/hooks/useCandles.ts`.
3. Provide the candles REST endpoint `/api/chart/candles` (or repoint `CHART_API_BASE` /
   `useCandles` at your own datafeed). The aggregator route
   (`apps/web/src/app/api/chart/candles/route.ts`) and its `SYMBOL_MAP` can be copied too, but it
   reaches out to Binance/Bybit/CoinGecko and `@/lib/server/pacifica`.
4. Keep or replace the hardcoded `PACIFICA_WS_URL = 'wss://ws.pacifica.fi/ws'` and the
   `symbolToPacifica` mapping for your venue.
5. Bring Tailwind tokens `surface-*`, `primary-*`, `win-*`, `loss-*` (see
   [02 – Design tokens](./02-design-tokens-css.md)) and the `Spinner` component.
6. Wire it where you want a fallback chart; it is **not** mounted by default in this repo.
