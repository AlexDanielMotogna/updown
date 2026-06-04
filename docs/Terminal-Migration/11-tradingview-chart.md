# TradingView Advanced Chart Integration

Part of the Trading Terminal Migration set — see [README](./README.md).

This doc covers the **TradingView Advanced Charting Library** integration used by the trading terminal: the React wrapper component, the custom **Pacifica Datafeed**, the realtime **WebSocketManager**, supported resolutions, theming/overrides, and the candle backend API the datafeed reads from.

> ⚠️ **PROPRIETARY BINARY — NOT AN NPM DEPENDENCY.**
> The TradingView **Advanced Charting Library** (`charting_library/`) is a closed-source, licensed binary that **is not on npm** and is **not** vendored as a package. In this repo it lives as static files under `apps/web/public/charting_library/` and is loaded at runtime via a `<script>` tag (see [Loading the library](#1-loading-the-library)). When migrating, **you must obtain your own copy from TradingView** (requires signing their license agreement / GitHub access request) and drop it into the new project's `public/charting_library/`. Nothing in this doc reproduces or substitutes that binary. There is also an unrelated embed-widget variant (`TradingViewChart.tsx`) that uses TradingView's public embed script — described separately at the end.

---

## File map

| File | Role |
|------|------|
| `apps/web/src/components/TradingViewChartAdvanced.tsx` | **Primary** React wrapper around the licensed charting library (528 lines). Used by the terminal. |
| `apps/web/src/components/TradingViewChart.tsx` | **Secondary/legacy** wrapper around TradingView's *public embed widget* (Binance/Bybit reference data, no Pacifica). Not the terminal chart. |
| `apps/web/src/lib/tradingview/PacificaDatafeed.ts` | Custom Datafeed implementing the TradingView Datafeed API (`onReady`, `resolveSymbol`, `getBars`, `subscribeBars`, …). |
| `apps/web/src/lib/tradingview/WebSocketManager.ts` | Singleton WS client to `wss://ws.pacifica.fi/ws` feeding realtime bars to the datafeed. Exports `wsManager` + `Bar` type. |
| `apps/web/src/lib/tradingview/index.ts` | Barrel: re-exports `PacificaDatafeed`, `intervalToResolution`, `resolutionToInterval`, `wsManager`, `Bar`. |
| `apps/web/public/tradingview-custom.css` | Custom CSS injected into the chart iframe via `custom_css_url`. |
| `apps/web/public/charting_library/**` | **The proprietary binary** (must be supplied separately). Loaded from `/charting_library/charting_library.standalone.js`. |
| `apps/web/src/app/api/chart/candles/route.ts` | Backend GET endpoint the datafeed's `getBars` calls. Aggregates Pacifica + Binance + Bybit + CoinGecko. |
| `apps/web/src/hooks/useCandles.ts` | Standalone candle hook (NOT used by the TV chart; powers `lightweight-charts`-style consumers). |
| `apps/web/src/hooks/useKlineData.ts` | Tiny close-price hook for mini/sparkline charts. |

---

## 1. Loading the library

`TradingViewChartAdvanced` injects a `<script>` pointing at the static binary, then waits for the global `window.TradingView`:

```ts
// effect: load TradingView script
if (window.TradingView) { setIsScriptLoaded(true); return; }

const existingScript = document.querySelector('script[src*="charting_library"]');
if (existingScript) { /* poll window.TradingView every 100ms */ }

const script = document.createElement('script');
script.src = '/charting_library/charting_library.standalone.js'; // <-- proprietary file
script.async = true;
script.onload = () => setIsScriptLoaded(true);
document.head.appendChild(script);
```

Files present in `public/charting_library/` (from the licensed package):
`charting_library.standalone.js` (the one actually loaded), `charting_library.js`, `charting_library.esm.js`, `charting_library.cjs.js`, `charting_library.d.ts`, `datafeed-api.d.ts`, `package.json`, `sameorigin.html`, and a `bundles/` directory of hashed JS/CSS chunks.

`library_path: '/charting_library/'` is passed to the widget so it can lazily fetch those `bundles/`.

**Migration note:** the global is referenced as `window.TradingView.widget`. You must add a TS ambient declaration (`declare global { interface Window { TradingView: any } }`) or import the bundled `charting_library.d.ts` types. In this codebase it is treated as `any`.

---

## 2. `TradingViewChartAdvanced` component

### Props

```ts
interface TradingViewChartAdvancedProps {
  symbol: string;                 // app format, e.g. "BTC-USD"
  interval?: string;              // app format, default '5m'
  height?: number;                // px, default 460
  currentPrice?: number;          // live mark price; drives quick-order side coloring
  onSymbolChange?: (symbol: string) => void;
  onIntervalChange?: (interval: string) => void;
  onQuickOrder?: (price: number, side: 'LONG' | 'SHORT', clickY?: number) => void;
  onWidgetReady?: (widget: ChartWidget) => void;
}
```

Exported `memo`: `export const TradingViewChartAdvanced = memo(TradingViewChartAdvancedComponent)`.

### `ChartWidget` interface (exported)

This is the locally-declared subset of the TradingView widget API the app actually uses. Reproduce verbatim:

```ts
export interface ChartWidget {
  onChartReady: (callback: () => void) => void;
  setSymbol: (symbol: string, resolution: string, callback?: () => void) => void;
  remove: () => void;
  subscribe: (event: string, callback: (...args: unknown[]) => void) => void;
  save: (callback: (state: object) => void) => void;
  onContextMenu: (callback: (unixTime: number, price: number) => ContextMenuItem[]) => void;
  activeChart: () => {
    createStudy: (name: string, forceOverlay: boolean, lock: boolean, inputs?: unknown[], overrides?: Record<string, unknown>) => Promise<unknown>;
    crossHairMoved: () => ISubscription<(params: { time: number; price: number }) => void>;
    createShape: (point: { time: number; price: number }, options: Record<string, unknown>) => unknown;
    removeShape: (shapeId: unknown) => void;
    removeEntity: (entityId: unknown) => void;
    removeAllShapes: () => void;
  };
}

interface ContextMenuItem { position: 'top' | 'bottom'; text: string; click: () => void; }
interface ISubscription<T> { subscribe: (context: null, callback: T) => void; unsubscribe: (context: null, callback: T) => void; }
```

### Widget construction options

Built inside the "initialize widget" effect (runs once `isScriptLoaded` is true). Reproduce these verbatim — they are the theme + behavior contract:

```ts
const widgetOptions = {
  container: containerRef.current,
  library_path: '/charting_library/',
  datafeed: new PacificaDatafeed(),
  symbol,                       // "BTC-USD"
  interval: tvResolution,       // e.g. "5" (from intervalToResolution(interval))
  locale: 'en',
  timezone: 'Etc/UTC',
  theme: 'dark',
  fullscreen: false,
  autosize: true,
  debug: false,
  toolbar_bg: '#111113',
  custom_css_url: '/tradingview-custom.css',
  auto_save_delay: 3,
  saved_data: savedState,       // restored from localStorage (see persistence)
  loading_screen: { backgroundColor: '#111113', foregroundColor: '#6366f1' },

  overrides: {
    'paneProperties.background': '#111113',
    'paneProperties.backgroundGradientStartColor': '#111113',
    'paneProperties.backgroundGradientEndColor': '#111113',
    'paneProperties.backgroundType': 'solid',
    'paneProperties.vertGridProperties.color': 'rgba(255, 255, 255, 0.05)',
    'paneProperties.horzGridProperties.color': 'rgba(255, 255, 255, 0.05)',
    'paneProperties.separatorColor': '#111113',
    'paneProperties.crossHairProperties.color': '#9ca3af',
    'scalesProperties.textColor': '#9ca3af',
    'scalesProperties.backgroundColor': '#111113',
    'scalesProperties.lineColor': '#111113',
    'scalesProperties.fontSize': 11,
    'scalesProperties.showSeriesBorderLine': false,
    'scalesProperties.showStudyBorderLine': false,
    'scalesProperties.showPriceScaleBorderLine': false,
    'scalesProperties.showTimeScaleBorderLine': false,
    'mainSeriesProperties.candleStyle.upColor': '#26A69A',
    'mainSeriesProperties.candleStyle.downColor': '#EF5350',
    'mainSeriesProperties.candleStyle.borderUpColor': '#26A69A',
    'mainSeriesProperties.candleStyle.borderDownColor': '#EF5350',
    'mainSeriesProperties.candleStyle.wickUpColor': '#26A69A',
    'mainSeriesProperties.candleStyle.wickDownColor': '#EF5350',
  },

  studies_overrides: {
    'volume.volume.color.0': 'rgba(239, 83, 80, 0.5)',
    'volume.volume.color.1': 'rgba(38, 166, 154, 0.5)',
    'volume.volume ma.color': '#FF6D00',
    'volume.volume ma.visible': false,
  },

  custom_font_family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",

  disabled_features: [
    'header_symbol_search', 'header_compare', 'header_undo_redo', 'header_screenshot',
    'control_bar', 'timeframes_toolbar', 'symbol_info', 'symbol_search_hot_key',
    'popup_hints', 'create_volume_indicator_by_default',
  ],
  enabled_features: [
    'hide_left_toolbar_by_default', 'move_logo_to_main_pane',
    'dont_show_boolean_study_arguments', 'hide_last_na_study_output',
  ],
};

const widget = new window.TradingView.widget(widgetOptions as any) as unknown as ChartWidget;
```

> Theme color `#111113` is the chart background. The candle up/down green/red are `#26A69A` / `#EF5350` (the standard TradingView pair). Accent/loading spinner is `#6366f1` (indigo). See [Design tokens](./02-design-tokens-css.md) if these need to map to the new design system.

### `onChartReady` work

When the chart is ready the component:

1. Sets `isChartReady` and dispatches a delayed `window.resize` (forces canvas paint when chart was occluded behind an overlay).
2. `widget.subscribe('onSymbolChanged', …)` → calls `onSymbolChange(symbolData.name)`.
3. `widget.subscribe('onIntervalChanged', …)` → calls `onIntervalChange(resolutionToInterval(newResolution))`.
4. **Default indicators (only when no saved state):** adds a `Volume` study as an overlay (`createStudy('Volume', true, false, …)`) and four EMAs via `createStudy('Moving Average Exponential', true, false, [length], { 'Plot.color', 'Plot.linewidth': 1 })` with lengths/colors `5/#FF6D00`, `10/#2962FF`, `30/#E91E63`, `60/#9C27B0`.
5. **Persistence:** `widget.subscribe('onAutoSaveNeeded', …)` → `widget.save(state => localStorage.setItem('tfc_tv_chart_state', JSON.stringify(state)))`. On init it restores `saved_data` from `localStorage['tfc_tv_chart_state']`. `auto_save_delay: 3`.
6. **Quick order via right-click:** `widget.onContextMenu((unixTime, price) => items)`. If `price < currentPrice` → "Limit Buy at $X" (`LONG`); else "Limit Sell at $X" (`SHORT`). Each item's `click` calls `onQuickOrder(price, side)`.
7. **Crosshair tracking:** `activeChart().crossHairMoved().subscribe(null, ({time, price}) => …)` stores `price` in a ref to live-color the floating "+" button.
8. Finally calls `onWidgetReady(widget)` so a parent can hold the widget handle.

### Symbol / interval change

A separate effect calls `widgetRef.current.setSymbol(symbol, tvResolution, cb)` when `symbol` or `tvResolution` props change (only after `isReadyRef`).

### The floating "+" quick-order button (iframe coupling)

The component renders an absolutely-positioned `+` button (`pointer-events: none`) and tracks the mouse by reaching into the chart **iframe's `contentDocument`** (`iframe.contentDocument`/`contentWindow.document`) for same-origin `mousemove`/`mouseleave`/`click` listeners. It maps iframe-local Y to container Y, colors the button teal (LONG, price below mark) or red (SHORT, price above mark), auto-hides after 2s, and on click computes `side` and calls `onQuickOrder(price, side, clickY)`. There is a fallback `document` mousemove listener for non-iframe rendering.

> This relies on the chart being **same-origin** (it is, served from `/charting_library/`). A cross-origin embed (like the public widget) would throw and fall back. Migration must keep the library self-hosted for this UX to work.

### Cleanup

On unmount: clears the hide timeout and calls `widgetRef.current.remove()`.

### Non-terminal overlay

A `TFC` watermark `<img src="/images/logos/favicon-white-192.png">` is centered at `opacity: 0.04`. Cosmetic — replace/remove in the new project.

---

## 3. `PacificaDatafeed` (the Datafeed API impl)

`new PacificaDatafeed()` is passed as `widgetOptions.datafeed`. It implements the standard TradingView **Datafeed API** methods.

### Supported resolutions

```ts
const SUPPORTED_RESOLUTIONS = ['1', '3', '5', '15', '30', '60', '120', '240', '480', '720', 'D'];
```

| TV resolution | Pacifica interval |
|---|---|
| `1` | `1m` |
| `3` | `3m` |
| `5` | `5m` |
| `15` | `15m` |
| `30` | `30m` |
| `60` | `1h` |
| `120` | `2h` |
| `240` | `4h` |
| `480` | `8h` |
| `720` | `12h` |
| `D` / `1D` | `1d` |

Exported helpers used by the component:
```ts
intervalToResolution('5m') // -> '5'  (default '5')
resolutionToInterval('5')  // -> '5m' (default '5m')
```

### `onReady(callback)`

Fetches markets first (`fetchMarkets()`), then (next tick) calls back with:

```ts
{
  exchanges: [{ value: 'PACIFICA', name: 'Pacifica', desc: 'Pacifica DEX' }],
  supported_resolutions: SUPPORTED_RESOLUTIONS,
  supports_marks: false,
  supports_time: true,
  supports_timescale_marks: false,
}
```

`fetchMarkets()` GETs `https://api.pacifica.fi/api/v1/info` → builds `marketsCache` of `{ symbol: "<S>-USD", baseAsset: "<S>" }`. Response shape:

```ts
interface PacificaInfoResponse {
  success: boolean;
  data: Array<{ symbol: string; max_leverage: number; tick_size: string; lot_size: string }>;
}
```

### `searchSymbols(userInput, _ex, _type, onResult)`

Filters `marketsCache` by substring, returns `{ symbol, description: '<base> Perpetual', exchange: 'PACIFICA', ticker, type: 'crypto' }[]`.
(Note: header symbol search is disabled in the widget, so this is largely inert in the terminal.)

### `resolveSymbol(symbolName, onResolve, onError)`

Normalizes to `<S>-USD`, returns a `LibrarySymbolInfo`:

```ts
{
  name: symbol, ticker: symbol,
  description: `${baseSymbol} Perpetual`,
  type: 'crypto', session: '24x7', timezone: 'Etc/UTC',
  exchange: 'PACIFICA', listed_exchange: 'PACIFICA',
  format: 'price',
  pricescale: getPriceScale(symbol),   // 100 (BTC/ETH), 10000 (SOL/BNB/AVAX/LINK/UNI/AAVE), else 1000000
  minmov: 1,
  has_intraday: true,
  intraday_multipliers: ['1','3','5','15','30','60','120','240','480','720'],
  has_daily: true, daily_multipliers: ['1'],
  has_empty_bars: false,
  supported_resolutions: SUPPORTED_RESOLUTIONS,
  volume_precision: 4,
  data_status: 'streaming',
}
```

`getPriceScale` controls decimal display: BTC/ETH → `100` (2 dp); SOL/BNB/AVAX/LINK/UNI/AAVE → `10000` (4 dp); everything else → `1000000`.

### `getBars(symbolInfo, resolution, periodParams, onResult, onError)` — historical bars

Reads the app's **aggregated backend** (NOT Pacifica directly):

```
GET /api/chart/candles?symbol=<BTC-USD>&interval=<5m>&start=<fromMs>&end=<toMs>
```

`periodParams.from`/`.to` are **seconds**; multiplied by 1000 to ms. Response:

```ts
{ success: boolean,
  data: Array<{ t:number; o:number; h:number; l:number; c:number; v:number }>,  // numbers already parsed
  meta?: { symbol, interval, startTime, endTime, count } }
```

Steps: map each row to `Bar {time:t(ms), open, high, low, close, volume}` → sort ascending → **`fillBarGaps()`** (insert synthetic flat candles, OHLC = prev close, volume 0, capped 500) → store `lastBars[<name>:<resolution>]` → `onResult(filledBars)`. Empty data → `onResult([], { noData: true })`.

> The bar `time` is in **milliseconds** here. TradingView accepts ms for intraday bars; this codebase consistently passes ms.

### `subscribeBars(symbolInfo, resolution, onTick, listenerGuid, _onResetCacheNeeded)` — realtime

```ts
const pacificaSymbol = symbolToPacifica(symbolInfo.name); // "BTC-USD" -> "BTC" ("KPEPE-USD" -> "1000PEPE")
const interval = RESOLUTION_MAP[resolution] || '5m';
const key = `${symbolInfo.name}:${resolution}`;

wsManager.subscribe(pacificaSymbol, interval, (bar) => {
  const lastBar = this.lastBars.get(key);
  if (lastBar && bar.time < lastBar.time) return; // drop stale
  this.lastBars.set(key, bar);
  onTick(bar);                                    // push to TradingView
}, listenerGuid);
```

`unsubscribeBars(listenerGuid)` → `wsManager.unsubscribe(listenerGuid)`.
`getServerTime(cb)` → `cb(Math.floor(Date.now()/1000))`.

---

## 4. `WebSocketManager` (realtime bars)

Singleton (`export const wsManager`). Connects lazily on first `subscribe`, reconnects with a 3s timer while subscriptions exist, and disconnects 5s after the last unsubscribe.

```ts
const PACIFICA_WS_URL = 'wss://ws.pacifica.fi/ws';

export interface Bar { time: number /*ms*/; open: number; high: number; low: number; close: number; volume?: number; }
```

### Subscribe / unsubscribe frames

Uses the **`mark_price_candle`** source (continuous, gap-free — the plain `candle` channel uses last-traded price and has gaps when no trades occur):

```ts
// subscribe
ws.send(JSON.stringify({ method: 'subscribe',
  params: { source: 'mark_price_candle', symbol, interval } }));
// unsubscribe
ws.send(JSON.stringify({ method: 'unsubscribe',
  params: { source: 'mark_price_candle', symbol, interval } }));
```

`symbol` is the Pacifica base (`"BTC"`), `interval` is the Pacifica string (`"5m"`).

### Incoming message → bar

```ts
interface PacificaCandleMessage {
  channel: 'mark_price_candle';
  data: { t:number; T:number; s:string; i:string; o:string; c:string; h:string; l:string; v:string; n:number };
}
```

`handleMessage` ignores anything where `channel !== 'mark_price_candle'`, builds a `Bar` (`time: data.t`, OHLCV via `parseFloat`), and dispatches to every stored subscription whose `symbol` and `interval` match `data.s`/`data.i`. Multiple datafeed subscriptions for the same symbol/interval share one WS subscription (dedup by `symbol:interval` key); the WS-level unsubscribe is only sent when the last listener for that pair is removed.

### How a realtime bar updates the chart

`mark_price_candle` emits the **current (open) candle** repeatedly with the same `t` (open time) as OHLC evolve. TradingView's `onTick` semantics: a tick with the same `time` as the last bar **updates** that bar; a tick with a newer `time` **appends** a new bar. The datafeed's `bar.time < lastBar.time` guard drops out-of-order/stale frames.

---

## 5. `tradingview-custom.css`

Loaded via `custom_css_url: '/tradingview-custom.css'`; injected into the chart's same-origin iframe. It forces the `#111113` background and removes visible borders/separators. Key rules (it targets internal TradingView class names, some hashed — these may change across library versions, e.g. `.group-wWM3zP_M-`):

```css
.chart-container, .chart-controls-bar, .chart-markup-table, .pane, .chart-page,
.layout__area--center { background-color: #111113 !important; }
.price-axis-container, .pane-legend, .time-axis-container { background-color: #111113 !important; }
.group-wWM3zP_M- { background-color: #111113 !important; }     /* hashed toolbar class — version-fragile */
.pane-separator { background-color: #111113 !important; border-color: #111113 !important; }
[class*="borderTop"], [class*="borderBottom"], [class*="borderLeft"], [class*="borderRight"] { border-color: #111113 !important; }
/* + matching border-color:#111113 rules on layout__area--* / chart-container / price-axis / time-axis */
```

> **Migration caution:** the hashed selector `.group-wWM3zP_M-` is tied to a specific library build. With a freshly-downloaded library version it will likely be a different hash and that rule will silently no-op. Re-derive via devtools, or prefer the `overrides`/`toolbar_bg` widget options where possible.

---

## 6. Backend candle API — `/api/chart/candles`

`apps/web/src/app/api/chart/candles/route.ts` — `GET`, query params `symbol` (`BTC-USD`), `interval` (`5m`…`1d`), `start`, `end` (ms epoch).

Aggregation strategy:
1. **Pacifica** first (via `ExchangeProvider.getAdapter('pacifica').getKlines(...)` when `process.env.USE_EXCHANGE_ADAPTER !== 'false'`, else direct `Pacifica.getMarkPriceKlines` → `Pacifica.getKlines`). Pacifica only has data from ~Jun 2025+.
2. For ranges older than Pacifica's earliest candle, fall back in order: **Binance Futures** (`https://fapi.binance.com/fapi/v1/klines`) → **Bybit** (`https://api.bybit.com/v5/market/kline?category=linear`) → **CoinGecko** (`/coins/{id}/ohlc`, daily only, no volume).
3. Merge (recent overwrites historical), `fillCandleGaps` (synthetic flat candles, OHLC = prev close, vol 0, cap 1000).

Response: `{ success: true, data: Candle[], meta: { symbol, interval, startTime, endTime, count } }` where `Candle = { t:ms, o, h, l, c, v }` (all numbers).

`SYMBOL_MAP` in this file is the source of truth for app↔exchange symbol mapping (Pacifica/Binance/Bybit/CoinGecko ids) and `KPEPE-USD → 1000PEPE / 1000PEPEUSDT`.

> **Migration note:** this endpoint pulls from external public APIs (Binance/Bybit/CoinGecko) with no auth, plus the internal Pacifica adapter (`@/lib/server/exchanges/provider`). If you migrate the TV chart you must port this route (or substitute your own candle source) — the datafeed is hard-wired to `GET /api/chart/candles`.

---

## 7. Auxiliary hooks (not used by the TV chart)

These are separate from the TradingView integration but share the candle conventions; include if the target needs lightweight/sparkline charts.

### `useCandles(symbol, interval)`  (`useCandles.ts`)
- Returns `{ candles, isConnected, isLoading, isLoadingMore, loadMoreHistory, error }`.
- `CandleData.time` is in **seconds** (for `lightweight-charts`), unlike the TV datafeed which uses ms.
- Loads history from the same `/api/chart/candles` endpoint (per-interval initial-day windows via `getInitialDays`), then opens its **own** WebSocket to `wss://ws.pacifica.fi/ws` subscribing to the plain `candle` source (last-traded price) — NOT `mark_price_candle`.
- `loadMoreHistory()` supports infinite back-scroll (200 candles per page).

### `useKlineData(symbol, interval, periods)`  (`useKlineData.ts`)
- Minimal: GETs `https://api.pacifica.fi/api/v1/kline?symbol=&interval=&start_time=&end_time=` directly, returns `number[]` of close prices for mini charts. Returns `{ data, isLoading, error }`.

---

## 8. `TradingViewChart.tsx` (secondary embed widget — usually skip)

A `memo` component that injects TradingView's **public** embed script `https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js` and shows **reference** Binance/Bybit perpetual charts (e.g. `BINANCE:BTCUSDT.P`) via a static `tvSymbolMap`. It does **not** use Pacifica data, the custom datafeed, or the licensed library. Props: `{ symbol, interval?, theme?, height? }`. The terminal uses `TradingViewChartAdvanced`; this file appears to be legacy/reference and can be dropped unless a no-license fallback chart is desired. (Also imported by `AiBiasWidget.tsx`, an AI-bias feature — out of terminal scope.)

---

## Quick migration checklist

- [ ] Obtain the licensed **Advanced Charting Library** from TradingView; copy into `public/charting_library/`. (Not on npm; not in this repo's package set.)
- [ ] Add `window.TradingView` ambient typing.
- [ ] Port `PacificaDatafeed.ts`, `WebSocketManager.ts`, `index.ts`, `tradingview-custom.css`, and the `TradingViewChartAdvanced` component.
- [ ] Port or replace `GET /api/chart/candles` (and its `@/lib/server/exchanges/provider` Pacifica adapter dependency, or swap your own candle source).
- [ ] Verify the chart is **self-hosted same-origin** so the iframe quick-order tracking works.
- [ ] Re-check `tradingview-custom.css` hashed selectors against your library build.
- [ ] **Strip fight/AI-bias coupling** (see below) — keep `onWidgetReady` generic.
