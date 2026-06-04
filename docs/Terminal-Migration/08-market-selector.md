# Market Selector & Price Ticker

Part of the Trading Terminal Migration set — see [README](./README.md)

This doc covers the **market dropdown / search picker**, **token icon resolution**, the **sparkline** SVG renderer, and the **`usePrices` hook** that streams live mark/oracle/funding/volume/OI data from Pacifica over WebSocket. These are the pieces that let a user pick which perp market to trade and see its live price + 24h change.

> Scope note: The `MarketSelector` has one fight-specific prop (`blockedSymbols`) used to grey out symbols the user can't trade mid-fight. This is the only fight coupling in this slice and is trivially removable — see [Fight entanglements](#fight-entanglements) at the bottom.

Related docs: [Design tokens & CSS](./02-design-tokens-css.md) · [Formatters](./03-formatters.md) · [Trade page layout](./05-trade-page.md)

---

## File map

| File | Purpose |
|------|---------|
| `apps/web/src/components/MarketSelector.tsx` (351 lines) | The dropdown button + portal-rendered searchable market table |
| `apps/web/src/components/TokenIcon.tsx` (149 lines) | Resolves & renders a token logo with multi-source fallback chain |
| `apps/web/src/components/Sparkline.tsx` (112 lines) | Standalone SVG sparkline (area + line). **NOT wired into MarketSelector** — see gaps |
| `apps/web/src/hooks/usePrices.ts` (353 lines) | Live price/market data hook (Pacifica REST + WS). Provides `markets`, `getPrice`, `prices` |
| `apps/web/src/lib/formatters.ts` | `formatPrice`, `formatUSD`, `formatPercent`, `formatFundingRate` etc. |
| `apps/web/src/lib/api.ts` | Has `getMarkets()` / `getPrices()` REST helpers — **NOT used by the terminal** (see section 5) |

---

## 1. `usePrices` — the live data source

`apps/web/src/hooks/usePrices.ts`. This hook is the single source of truth for both the **markets list** and **live prices**. The terminal does NOT use the internal `/api/markets` route for this; it talks to Pacifica directly from the browser.

### Endpoints (hard-coded constants)

```ts
const PACIFICA_API_BASE = 'https://api.pacifica.fi';
const PACIFICA_WS_URL   = 'wss://ws.pacifica.fi/ws';
```

| Source | Use |
|--------|-----|
| `GET https://api.pacifica.fi/api/v1/info` (REST, one-shot, 10s timeout, 3 retries @ 2s) | Market metadata: `max_leverage`, `tick_size`, `lot_size`, min/max order size. Cached in module-level `marketInfoCache`. |
| `wss://ws.pacifica.fi/ws` channel `prices` (subscribe `{ method:'subscribe', params:{ source:'prices' } }`) | Live mark/oracle/mid/funding/next_funding/open_interest/volume_24h/yesterday_price for ALL symbols. Reconnects after 3s on close. |

### Symbol mapping

Pacifica uses bare symbols (`BTC`, `1000PEPE`). The app uses `<BASE>-USD`:

```ts
const pacificaToSymbol = (s: string) => s === '1000PEPE' ? 'KPEPE-USD' : `${s}-USD`;
```
The reverse (`symbolToPacifica`) lives in `formatters.ts` (`KPEPE-USD` -> `1000PEPE`). A `symbolNames` map in `usePrices.ts` (~50 entries) maps base symbol -> human name (e.g. `BTC` -> `Bitcoin`).

### WS message -> PriceData transform (verbatim, the important bits)

```ts
const markPrice     = parseFloat(priceData.mark);
const oraclePrice   = parseFloat(priceData.oracle);
const yesterdayPrice= parseFloat(priceData.yesterday_price);
const change24h = yesterdayPrice > 0
  ? ((oraclePrice - yesterdayPrice) / yesterdayPrice) * 100
  : 0;

newPrices[ourSymbol] = {
  symbol: ourSymbol,
  price: markPrice,            // mark price
  oracle: oraclePrice,
  change24h,                   // already a percentage, e.g. 2.34
  high24h: oraclePrice * 1.02, // ! FAKE — API gives no 24h hi/lo
  low24h:  oraclePrice * 0.98, // ! FAKE
  volume24h: parseFloat(priceData.volume_24h),
  openInterest: parseFloat(priceData.open_interest) * oraclePrice, // OI base units -> *price = USD
  funding:     parseFloat(priceData.funding) * 100,       // -> percentage
  nextFunding: parseFloat(priceData.next_funding) * 100,  // -> percentage
  lastUpdate: priceData.timestamp,
  maxLeverage: marketInfo?.max_leverage ?? 10,
  tickSize:   marketInfo?.tick_size ? parseFloat(marketInfo.tick_size) : 0.01,
  lotSize:    marketInfo?.lot_size  ? parseFloat(marketInfo.lot_size)  : 0.00001,
};
```

**Gotchas the migrator must know:**
- `change24h` is computed from **oracle vs yesterday_price**, already a percent (`(o-y)/y*100`). `formatPercent` expects this scale.
- `high24h`/`low24h` are **synthetic** (`+/-2%`). Pull a real endpoint if you need true 24h hi/lo.
- `openInterest` is multiplied by oracle to get USD; `volume24h` is already USD from the API.
- `funding`/`nextFunding` are multiplied by 100 to become percentages — `formatFundingRate` shows 4 decimals.
- If REST `/info` is slow, the markets list is **bootstrapped from the WS stream** (sorted by volume desc) so the UI is never empty.

### `PriceData` shape (hook-internal interface)

```ts
interface PriceData {
  symbol: string; price: number; oracle: number;
  change24h: number; high24h: number; low24h: number;
  volume24h: number; openInterest: number;
  funding: number; nextFunding: number;
  lastUpdate: number; maxLeverage: number;
  tickSize: number; lotSize: number;
}
```

### Exported `Market` shape

```ts
export interface Market { symbol: string; name: string; maxLeverage: number; }
```

### Hook return value

```ts
const { prices, markets, isConnected, error, getPrice, formatPrice } = usePrices();
```

| Field | Type | Notes |
|-------|------|-------|
| `prices` | `Record<string, PriceData>` | keyed by `BTC-USD` etc. |
| `markets` | `Market[]` | sorted by volume desc on first WS frame |
| `isConnected` | `boolean` | WS open state |
| `error` | `string \| null` | |
| `getPrice` | `(symbol) => PriceData \| null` | memoized lookup into `prices` |
| `formatPrice` | `(n) => string` | hook-local formatter (NOTE: different from `formatters.ts`) |

`usePrices` takes an optional `{ symbols?: string[] }` but **ignores it** — it always tracks all symbols.

---

## 2. `MarketSelector` component

`apps/web/src/components/MarketSelector.tsx`. A button showing the current market that opens a **portal-rendered** (`createPortal` to `document.body`) searchable/sortable table of all markets.

### Props

```ts
interface Market { symbol: string; name: string; maxLeverage: number; }

interface PriceData {            // ! a LOCAL, narrower copy — not imported from usePrices
  price?: number; oracle?: number; change24h?: number;
  volume24h?: number; openInterest?: number;
  funding?: number; nextFunding?: number;
}

interface MarketSelectorProps {
  markets: Market[];
  selectedMarket: string;                                  // e.g. "BTC-USD"
  onSelectMarket: (symbol: string) => void;
  getPrice: (symbol: string) => PriceData | undefined | null;
  blockedSymbols?: string[];   // ! FIGHT-ONLY: symbols disabled in the dropdown (default [])
}
```

### Usage (from `apps/web/src/app/trade/page.tsx`, two call sites — mobile bar + desktop chart header)

```tsx
const { markets, getPrice } = usePrices({ /* ... */ });

<MarketSelector
  markets={markets.length > 0 ? markets : [DEFAULT_MARKET]}
  selectedMarket={selectedMarket}
  onSelectMarket={handleMarketChange}
  getPrice={getPrice}
  blockedSymbols={inFight ? blockedSymbols : []}   // ! strip for non-fight rebuild -> [] or remove prop
/>
```

### Behaviour

| Feature | Implementation |
|---------|----------------|
| **Open/close** | `isOpen` state toggled by button; closes on outside `mousedown` (ignores the toggle button via `buttonRef.contains`). |
| **Portal** | Rendered into `document.body` with `createPortal`, only after `mounted` (avoids SSR hydration mismatch). z-index `z-[9999]` (backdrop `z-[9998]`). |
| **Positioning** | On open reads `buttonRef.getBoundingClientRect()`. Desktop: `fixed` at `top = rect.bottom + 8`, `left = max(16, rect.left)`, width `900px`, `maxWidth: calc(100vw - 32px)`, `maxHeight: 70vh`. Mobile (`window.innerWidth < 1024`): `inset-4 top-16`, dark backdrop, close button. |
| **Search** | Auto-focused input; filters by `symbol` OR `name` (case-insensitive `includes`). |
| **Sort** | Click headers to sort by `volume` / `change` / `symbol`. Default `volume` desc. Same column toggles direction; new column resets to desc. Active column shows arrow in `text-primary-400`. |
| **Row select** | `onSelectMarket(symbol)` then closes + clears search. Blocked rows non-clickable. |
| **No results** | Renders `No markets found`. |

### Table columns

| Header | Value source | Formatter | Notes |
|--------|--------------|-----------|-------|
| Symbol | `extractBaseSymbol(market.symbol)` + `<TokenIcon>` + `{maxLeverage}x` badge | — | amber `Blocked` badge if blocked |
| Mark Price | `priceData.price` | `formatPrice` | `-` if 0 |
| 24h Change | `priceData.change24h` | `formatPercent` | green `text-win-400` / red `text-loss-400`; `-` if 0 |
| Next Funding | `priceData.nextFunding` | `formatFundingRate` | green/red; `-` if 0 |
| Volume (`hidden sm:table-cell`) | `priceData.volume24h` | `formatUSD` | `-` if 0 |
| Open Interest (`hidden md:table-cell`) | `priceData.openInterest` | `formatUSD` | `-` if 0 |

The trigger **button** shows: `<TokenIcon size="sm">` + `selectedMarket` (full `BTC-USD`, `font-display font-semibold`) + chevron rotating 180deg when open.

### Key Tailwind classes (copy-paste)

- Trigger button: `flex items-center gap-2 px-3 py-1.5 bg-surface-800 hover:bg-surface-700 border border-surface-800 rounded-lg transition-colors`
- Dropdown panel: `fixed bg-surface-900 border-surface-800 rounded-xl shadow-2xl z-[9999] overflow-hidden flex flex-col`
- Mobile panel variant adds: `inset-4 top-16` with `style={{ maxHeight: 'calc(100vh - 80px)' }}`
- Search input: `w-full pl-10 pr-4 py-2 bg-surface-800 border border-surface-800 rounded-lg text-sm text-white placeholder-surface-500 focus:outline-none focus:border-primary-500`
- Selected row: `bg-primary-500/10 cursor-pointer`; hover row: `hover:bg-surface-800/50 cursor-pointer`; blocked row: `opacity-50 cursor-not-allowed`
- Leverage badge: `px-1.5 py-0.5 text-[10px] font-medium bg-surface-700 text-surface-300 rounded`

> Required design tokens: `surface-{500,700,800,900}`, `primary-{400,500}`, `win-400`, `loss-400`, `amber-{400,500}`, and the `font-display` family. See [Design tokens](./02-design-tokens-css.md).

---

## 3. `TokenIcon` — logo resolution

`apps/web/src/components/TokenIcon.tsx`. Renders a circular token logo, trying a chain of remote URLs, falling back to a colored 2-letter monogram if all fail.

### Props

```ts
interface TokenIconProps {
  symbol: string;                              // accepts "BTC-USD", "USD/JPY", or "BTC"
  size?: 'xs'|'sm'|'md'|'lg'|'xl';             // default 'md'
  className?: string;
  showFallback?: boolean;                      // default true; if false, render nothing on total failure
}
```

Size -> class map: `xs:w-4 h-4`, `sm:w-5 h-5`, `md:w-6 h-6`, `lg:w-8 h-8`, `xl:w-10 h-10`.

### URL resolution chain — `getIconUrls(symbol)` (exported)

1. **Pacifica (primary):** `https://app.pacifica.fi/imgs/tokens/<SYMBOL>.svg`
   - `<SYMBOL>` = uppercased base symbol, except `KPEPE->kPEPE`, `KBONK->kBONK` (Pacifica lowercase-`k`, via `PACIFICA_TOKEN_NAMES`).
2. **Fallback map** (`FALLBACK_ICONS`) for non-crypto assets, if present:
   - Forex flags -> `https://flagcdn.com/w80/<cc>.png` (USD/JPY/EUR/GBP/CHF/CAD/AUD)
   - Stocks -> `https://companiesmarketcap.com/img/company-logos/64/<TICKER>.webp` (TSLA, NVDA, AAPL, GOOGL->GOOG, AMZN, META, MSFT)
   - Commodities -> metals-api.com (XAG silver, XAU gold)
3. **Last resort:** `https://coinicons-api.vercel.app/api/icon/<lowercase-base>`

On `<img onError>`, advances `currentUrlIndex` to next URL; when exhausted shows the **text fallback**: a `rounded-full` chip with `baseSymbol.slice(0,2)`, colored by `baseSymbol.charCodeAt(0) % 8` from a fixed 8-color palette (blue/green/purple/orange/pink/cyan/yellow/red, all `bg-*-500/30 text-*-400`). Images use `loading="lazy"` and `object-cover`.

### `extractBaseSymbol(symbol)` (exported helper)

```ts
export const extractBaseSymbol = (symbol: string): string => {
  if (symbol.includes('-')) return symbol.split('-')[0] ?? symbol; // BTC-USD -> BTC
  if (symbol.includes('/')) return symbol.split('/')[0] ?? symbol; // USD/JPY -> USD
  return symbol;
};
```
Used by `TokenIcon` and `MarketSelector` (rows show base symbol; trigger button shows full pair). Plain `<img>` (not Next `<Image>`), so no `next.config` `images.domains` allow-list needed.

---

## 4. `Sparkline` — SVG mini-chart

`apps/web/src/components/Sparkline.tsx`. A pure, self-contained SVG sparkline (gradient area fill + line). **Standalone — currently NOT used by `MarketSelector` or `usePrices`.** In this repo it is only consumed by the (out-of-scope) profile page. Included because the brief listed it; reuse it for per-row sparklines if desired.

### Props & defaults

```ts
interface SparklineProps {
  data: number[];          // needs >=2 points or renders null
  color?: string;          // default '#6366f1' (indigo / primary-500)
  width?: number;          // default 60
  height?: number;         // default 24
  showTrend?: boolean;     // default false; shows up/down arrow in win/loss color
}
```

### How it draws

- Scales `data` into the `width x height` box: `x = (i/(n-1))*width`, `y = height - ((v-min)/range)*height` (`range = max-min || 1`).
- Builds `M x0,y0 L x1,y1 ...` path; area path closes to baseline and fills with a per-color `<linearGradient>` (`id="gradient-<hexNoHash>"`, 0.4->0 opacity).
- Line: `stroke={color}` width 2, rounded caps/joins. SVG is `preserveAspectRatio="none"`, `opacity-70`, `overflow: visible`.
- Trend (`showTrend`): compares last vs first point; up-arrow `text-win-400` if up else down-arrow `text-loss-400`.

### Bundled helper (mock data)

```ts
export function generateMockTrendData(currentValue, dataPoints=10, volatility=0.15): number[]
```
Fake random-walk ending at `currentValue`. **Placeholder only** — replace with real history (e.g. Pacifica klines) in production.

---

## 5. Markets via internal API (alternative, NOT used by terminal)

`apps/web/src/lib/api.ts` exposes server-backed helpers the terminal **does not** call for the selector:

```ts
export interface Market { symbol; tickSize; maxLeverage; minOrderSize; maxOrderSize; } // strings except maxLeverage
export interface MarketPrice { symbol; mark; oracle; fundingRate; volume24h; }          // all strings
export async function getMarkets(): Promise<Market[]>      // GET {NEXT_PUBLIC_API_URL|/api}/markets
export async function getPrices(): Promise<MarketPrice[]>  // GET .../markets/prices
```
`fetchApi` unwraps `{ success, data }` envelopes and supports a `token` (Bearer). Env: `NEXT_PUBLIC_API_URL` (defaults `/api`). To use a server proxy instead of hitting Pacifica from the browser, wire `MarketSelector` to these — shapes are string-typed, so adapt the `getPrice` adapter.

---

## 6. Formatters used here

From `apps/web/src/lib/formatters.ts` (see [Formatters doc](./03-formatters.md)):

| Fn | Behaviour summary |
|----|-------------------|
| `formatPrice(n)` | magnitude-aware: >=100 -> 2dp w/ separators, >=1 -> 4dp, >=0.01 -> 5dp, >=0.0001 -> 6dp, else 8dp |
| `formatUSD(n, {compact?})` | `$` + thousands; auto K/M/B when compact or >=1B |
| `formatPercent(n, dp=2)` | signed, `+2.34%` |
| `formatFundingRate(n)` | signed, 4dp, `+0.0123%` |

Note there are **two** `formatPrice` impls (one in `formatters.ts`, one returned by `usePrices`); `MarketSelector` imports the `formatters.ts` one.

---

## Fight entanglements

The only fight coupling in this slice:

1. **`MarketSelector` `blockedSymbols?: string[]` prop** (`MarketSelector.tsx` lines 29, 32, 251, 257, 263, 269, 278-282). Greys out / disables rows for symbols the user held a position in before a fight started; shows an amber `Blocked` badge and tooltip "Blocked: You had a position in this symbol before the fight started". **To strip:** remove the prop + every `isBlocked` branch; rows become always-clickable. No other change needed.
2. **Call sites in `trade/page.tsx`** pass `blockedSymbols={inFight ? blockedSymbols : []}`. Outside the fight game, pass `[]` or delete the prop.

`usePrices`, `TokenIcon`, and `Sparkline` contain **zero** fight/duel logic.

## Gaps the migrator must supply

- **Design tokens / Tailwind theme:** all `surface-*`, `primary-*`, `win-400`, `loss-400`, `amber-*` colors and the `font-display` family. See [Design tokens](./02-design-tokens-css.md).
- **Formatters module** (`lib/formatters.ts`) — imported by `MarketSelector`.
- **Real 24h high/low** — `usePrices` fakes these as oracle +/-2%.
- **Sparkline data** — no data source wired; `generateMockTrendData` is placeholder. Provide real klines to use per-market sparklines.
- **Pacifica account / pairs** — markets list is whatever `/api/v1/info` returns. For a different exchange, replace `usePrices` (endpoints, symbol mapping, WS message shape).
- **`DEFAULT_MARKET`** constant — used at call sites as fallback `markets` value; defined in `trade/page.tsx`, not in this slice.
- **Outside-click / portal** rely on `window`/`document` + `react-dom` `createPortal`; ensure SSR-safe mounting (the `mounted` guard is already present).

## External dependencies

- `react`, `react-dom` (`createPortal`)
- Pacifica HTTP `https://api.pacifica.fi/api/v1/info` and WS `wss://ws.pacifica.fi/ws` (channel `prices`)
- Token icon CDNs: `app.pacifica.fi`, `flagcdn.com`, `companiesmarketcap.com`, `metals-api.com`, `coinicons-api.vercel.app`
- Tailwind CSS (custom theme tokens)
- Env: `NEXT_PUBLIC_API_URL` (only if switching to internal `getMarkets`/`getPrices`)
