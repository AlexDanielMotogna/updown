# Market Data Hooks

Part of the Trading Terminal Migration set — see [README](./README.md).

This doc covers the five client-side hooks that feed live and historical market data into the terminal: order book, prices/markets, chart candles, mini-chart klines, and platform stats. All live in `apps/web/src/hooks/` and are re-exported from `apps/web/src/hooks/index.ts`.

> **Important:** Despite `apps/web/src/lib/queryClient.ts` existing in the project, **none of these five hooks use React Query / TanStack Query.** They use raw `useState`/`useEffect` with either a direct `WebSocket`, a `fetch`, or a shared Socket.IO connection. There are therefore **no React Query keys** for these hooks. The `queryClient` defaults (`staleTime: 10s`, `refetchOnWindowFocus`, `retry: 2`, `gcTime: 24h`) apply only to *other* hooks (positions, orders, fights, notifications) — not these. The "React Query key" column below is N/A throughout.

---

## Summary table

| Hook | File | Transport | Endpoint / WS | Returns | Polling / Refetch | React Query key |
|------|------|-----------|---------------|---------|-------------------|-----------------|
| `useOrderBook` | `useOrderBook.ts` | **WebSocket** (direct) | `wss://ws.pacifica.fi/ws` source `book` | `{ orderBook, isConnected, isLoading, error }` | Push (no poll); reconnect 3s | N/A |
| `usePrices` | `usePrices.ts` | **WebSocket** (direct) + 1 REST bootstrap | WS `wss://ws.pacifica.fi/ws` source `prices`; REST `GET https://api.pacifica.fi/api/v1/info` | `{ prices, markets, isConnected, error, getPrice, formatPrice }` | Push (no poll); reconnect 3s; REST once (3 retries) | N/A |
| `useCandles` | `useCandles.ts` | **REST history + WebSocket live** | REST `GET /api/chart/candles` (Next route); WS `wss://ws.pacifica.fi/ws` source `candle` | `{ candles, isConnected, isLoading, isLoadingMore, loadMoreHistory, error }` | Push for live; REST on symbol/interval change + on `loadMoreHistory()`; reconnect 3s | N/A |
| `useKlineData` | `useKlineData.ts` | **REST (one-shot)** | `GET https://api.pacifica.fi/api/v1/kline` | `{ data: number[], isLoading, error }` | Fetch once per `[symbol, interval, periods]` change; no poll | N/A |
| `useStats` | `useStats.ts` | **Socket.IO (shared) + REST bootstrap** | REST `GET /api/stats`; Socket.IO event `platform:stats` via `useGlobalSocket` | `{ stats, isLoading, error, isConnected }` | REST once on mount; then push via Socket.IO | N/A |

Shared constants used across the WS hooks:

```ts
const PACIFICA_WS_URL  = 'wss://ws.pacifica.fi/ws';
const PACIFICA_API_BASE = 'https://api.pacifica.fi';
```

### Symbol mapping (used by every hook)

Internal symbols are `"<BASE>-USD"` (e.g. `"BTC-USD"`). Pacifica wants bare base symbols. The only special case is kPEPE:

```ts
// our -> Pacifica
const symbolToPacifica = (symbol: string): string => {
  if (symbol === 'KPEPE-USD') return '1000PEPE';
  return symbol.replace('-USD', '');
};

// Pacifica -> our
const pacificaToSymbol = (pacificaSymbol: string): string => {
  if (pacificaSymbol === '1000PEPE') return 'KPEPE-USD';
  return `${pacificaSymbol}-USD`;
};
```

> This is duplicated in each hook. When migrating, hoist to a shared util. See [Pacifica integration](./11-pacifica-integration.md) for the canonical mapping if it exists there.

---

## 1. `useOrderBook(symbol, aggLevel)`

**File:** `apps/web/src/hooks/useOrderBook.ts`

### Signature

```ts
export type AggLevel = 1 | 10 | 100 | 1000 | 10000;

export function useOrderBook(
  symbol: string,
  aggLevel: AggLevel = 1
): {
  orderBook: OrderBookData | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
};
```

### Data source

Direct WebSocket to `wss://ws.pacifica.fi/ws`. On open it sends:

```json
{ "method": "subscribe", "params": { "source": "book", "symbol": "BTC", "agg_level": 1 } }
```

`agg_level` is a multiplier of the market `tick_size`. On unmount it sends the mirror `unsubscribe` (only if `readyState === OPEN`) then closes.

### Incoming WS message shape

```ts
interface PacificaBookMessage {
  channel: 'book';
  data: {
    s: string;                                          // symbol (Pacifica format)
    l: [PacificaBookLevel[], PacificaBookLevel[]];      // [bids, asks]
    t: number;                                          // timestamp (ms)
  };
}
interface PacificaBookLevel { p: string; a: string; n: number; } // price, amount, #orders
```

Messages whose `data.s !== pacificaSymbol` are ignored (guards against stale frames after a symbol switch).

### Returned data shape

```ts
export interface OrderBookLevel { price: number; size: number; orders: number; }
export interface OrderBookData {
  symbol: string;            // our format, e.g. "BTC-USD"
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}
```

`p`/`a` are `parseFloat`'d; `n` passes through as `orders`.

### Lifecycle

- The whole connection lives in a single `useEffect` keyed on `[symbol, aggLevel]`. Changing either tears down and rebuilds the socket and resets all state.
- Reconnect: `ws.onclose` schedules reconnect after **3000ms** (unless cancelled).
- `isLoading` flips to `false` on the first valid `book` frame.

### Consumers

- `apps/web/src/components/OrderBook.tsx` (line 120): `const { orderBook, isLoading } = useOrderBook(symbol, aggLevel);`

---

## 2. `usePrices(options?)`

**File:** `apps/web/src/hooks/usePrices.ts`

### Signature

```ts
interface UsePricesOptions { symbols?: string[]; }   // NOTE: param is ignored — see below

export function usePrices(_options: UsePricesOptions = {}): {
  prices: Record<string, PriceData>;   // keyed by "BTC-USD"
  markets: Market[];
  isConnected: boolean;
  error: string | null;
  getPrice: (symbol: string) => PriceData | null;
  formatPrice: (price: number) => string;
};
```

> **The `symbols` option is intentionally ignored.** The hook always subscribes to *all* symbols (`source: 'prices'` with no symbol filter). Several call sites pass `{ symbols: [...] }` but it has no effect; they just read `prices['BTC-USD']` etc.

### Data sources (two, in parallel)

1. **REST bootstrap** — `GET https://api.pacifica.fi/api/v1/info` (10s timeout). Provides per-market `max_leverage`, `tick_size`, `lot_size`. Cached in **module-level** vars (`marketInfoCache`, `marketInfoLoaded`) so it fetches **once per page load across all hook instances**. Retries up to **3** times, 2000ms apart.
2. **WebSocket** — `wss://ws.pacifica.fi/ws`, subscribe `{ method: 'subscribe', params: { source: 'prices' } }`. Streams all symbols continuously. Reconnect after **3000ms** on close.

The `markets` list is built from REST when available, else falls back to building it from the first WS frame (sorted by `volume24h` desc) so the dropdown is never empty.

### Incoming WS message shape

```ts
interface PacificaWsPriceData {
  symbol: string; mark: string; oracle: string; mid: string;
  funding: string; next_funding: string; open_interest: string;
  volume_24h: string; yesterday_price: string; timestamp: number;
}
interface PacificaPricesMessage { channel: 'prices'; data: PacificaWsPriceData[]; }
```

### Returned data shapes

```ts
interface PriceData {
  symbol: string;       // "BTC-USD"
  price: number;        // mark price
  oracle: number;       // oracle price
  change24h: number;    // % computed from (oracle - yesterday_price) / yesterday_price * 100
  high24h: number;      // SYNTHETIC: oracle * 1.02 (API gives no 24h high)
  low24h: number;       // SYNTHETIC: oracle * 0.98 (API gives no 24h low)
  volume24h: number;
  openInterest: number; // open_interest * oracle (converted to notional)
  funding: number;      // funding * 100 (percentage)
  nextFunding: number;  // next_funding * 100 (percentage)
  lastUpdate: number;
  maxLeverage: number;  // from REST info cache; default 10
  tickSize: number;     // from REST info cache; default 0.01
  lotSize: number;      // from REST info cache; default 0.00001
}

export interface Market {
  symbol: string;       // "BTC-USD"
  name: string;         // "Bitcoin" (from local symbolNames map)
  maxLeverage: number;  // 50
}
```

> **Gotchas to preserve in the rebuild:** `high24h`/`low24h` are *fabricated* (`oracle * 1.02 / 0.98`) — Pacifica's WS does not provide them. `funding`/`nextFunding` are multiplied by 100. `openInterest` is multiplied by oracle to convert from base units to USD notional.

`symbolNames` is a large hard-coded `Record<string,string>` (BTC→Bitcoin, `1000PEPE`→kPEPE, etc.) in the file; copy it verbatim or replace with your own display-name source.

### Helpers returned

- `getPrice(symbol)` → `prices[symbol] ?? null`.
- `formatPrice(price)` → string: `>=1000` → `toLocaleString` 2dp; `>=1` → `toFixed(4)`; else `toFixed(6)`.

### Consumers (many — this is the central price feed)

| File | Usage |
|------|-------|
| `apps/web/src/app/trade/page.tsx:271` | `const { markets, getPrice } = usePrices({...})` — main terminal |
| `components/QuickPositionsBar.tsx:55,206` | `prices`, `getPrice` |
| `components/QuickPositionModal.tsx:35` | `getPrice` |
| `components/MarketCloseModal.tsx:66` | `getPrice` |
| `components/LimitCloseModal.tsx:61` | `getPrice` |
| `components/TpSlModal.tsx:95` | `getPrice` |
| `components/AiBiasWidget.tsx:70` | `getPrice` (AiBias is a fight/game feature — see entanglements) |
| `components/landing/HeroSection.tsx:40` | `prices, isConnected` (landing page) |
| `components/landing/CryptoTickers.tsx:43` | `prices, isConnected` (landing) |
| `components/landing/FAQSection.tsx:40` | `markets` (landing) |
| `components/landing/Web3Experience.tsx:47` | `markets` (landing) |

---

## 3. `useCandles(symbol, interval)`

**File:** `apps/web/src/hooks/useCandles.ts`

### Signature

```ts
type CandleInterval =
  '1m'|'3m'|'5m'|'15m'|'30m'|'1h'|'2h'|'4h'|'8h'|'12h'|'1d';

export function useCandles(
  symbol: string,
  interval: CandleInterval = '5m'
): {
  candles: CandleData[];
  isConnected: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  loadMoreHistory: () => Promise<void>;
  error: string | null;
};
```

### Data sources (history via our API, live via Pacifica WS)

1. **Historical (REST):** `GET /api/chart/candles?symbol=<our>&interval=<i>&start=<ms>&end=<ms>` — served by the **Next.js route** `apps/web/src/app/api/chart/candles/route.ts` (same origin, `CHART_API_BASE = ''`). This route aggregates **Pacifica → Binance Futures → Bybit → CoinGecko** (see "Chart API route" below). Initial window size depends on interval via `getInitialDays` (e.g. `1m`→1 day, `1h`→60 days, `1d`→730 days).
2. **Live (WebSocket):** `wss://ws.pacifica.fi/ws`, subscribe `{ method:'subscribe', params:{ source:'candle', symbol, interval } }`. Reconnect after **3000ms** on close.

> `source: 'candle'` is the **last-traded-price** candle (matches Pacifica's own UI). The file also references a `mark`/kline variant in types but subscribes to `candle`.

### `loadMoreHistory()` (infinite scroll back)

Fetches **200** older candles ending just before `oldestTimestamp`, via the same `/api/chart/candles` endpoint, then merges + re-sorts. Guards against `symbol`/`interval` changing mid-fetch by comparing against `currentSymbolRef`/`currentIntervalRef`. Sets `oldestTimestamp` to the first returned candle's `t`.

### Live-candle merge logic (preserve exactly)

On each `candle` WS frame (after filtering on `s` and `i`):
- if `candle.time === last.time` → replace last
- if `candle.time > last.time` → append
- else → find by time and update in place

### REST response shape consumed (`/api/chart/candles`)

```ts
interface ChartApiResponse {
  success: boolean;
  data: Array<{ t:number; o:number; h:number; l:number; c:number; v:number }>; // t in ms, numbers parsed
  meta?: { symbol:string; interval:string; startTime:number; endTime:number; count:number };
}
```

### Returned data shape

```ts
export interface CandleData {
  time: number;   // UNIX seconds (divided by 1000 for lightweight-charts)
  open: number; high: number; low: number; close: number; volume: number;
}
```

> All timestamps are converted from ms → **seconds** (`Math.floor(t/1000)`) because the chart library (`lightweight-charts`) expects seconds.

### Consumers

- `apps/web/src/components/PacificaChart.tsx:90` — `const { candles, isConnected, isLoading, isLoadingMore, loadMoreHistory } = useCandles(symbol, interval);` See [Chart component](./05-chart-pacificachart.md).

### Chart API route — `app/api/chart/candles/route.ts` (server)

`GET /api/chart/candles` is the backend this hook calls. Key facts the migrator must reproduce:

- **Query params (all required):** `symbol` (our format), `interval`, `start` (ms), `end` (ms). Validates `start < end`, valid integers, and a minimum range of one `interval`.
- **Aggregation strategy:** always try **Pacifica first** for the full range, then backfill *older* gaps from **Binance Futures → Bybit → CoinGecko**, merge (recent overwrites historical), and **fill internal gaps** with synthetic flat candles (`o=h=l=c=prev.close, v=0`, capped at 1000 per gap).
- **External APIs called server-side:**
  - `https://fapi.binance.com/fapi/v1/klines` (limit 1500, paginated forward)
  - `https://api.bybit.com/v5/market/kline?category=linear` (limit 1000, paginated backward; interval map e.g. `1h`→`60`, `1d`→`D`)
  - `https://api.coingecko.com/api/v3/coins/<id>/ohlc` (daily only, no volume; skipped for intraday)
  - Pacifica via the **exchange adapter** `ExchangeProvider.getAdapter('pacifica').getKlines(...)` when `process.env.USE_EXCHANGE_ADAPTER !== 'false'`, else direct `Pacifica.getMarkPriceKlines` / `getKlines` from `@/lib/server/pacifica`.
- **Symbol map** `SYMBOL_MAP` is hard-coded in the route (per-source IDs incl. CoinGecko id). Unknown symbols fall back to `<BASE>` for Pacifica, `<BASE>USDT` for Binance/Bybit.
- **Env var:** `USE_EXCHANGE_ADAPTER` (defaults to enabled). Adapter may use Redis caching if configured.
- Uses error helpers from `@/lib/server/errors` and `@/lib/server/error-codes` (`BadRequestError`, `ServiceUnavailableError`, `errorResponse`, `ErrorCode`).

---

## 4. `useKlineData(symbol, interval, periods)`

**File:** `apps/web/src/hooks/useKlineData.ts`

Lightweight one-shot fetcher for sparkline / mini-charts (close prices only).

### Signature

```ts
export function useKlineData(
  symbol: string,
  interval: '1h' | '4h' | '1d' = '1h',
  periods: number = 50
): {
  data: number[];          // array of close prices, oldest→newest
  isLoading: boolean;
  error: string | null;
};
```

### Data source

Single `fetch` (no WS, no React Query) directly to Pacifica:

```
GET https://api.pacifica.fi/api/v1/kline?symbol=<pac>&interval=<i>&start_time=<ms>&end_time=<now>
```

`start_time = now - periods * intervalMs`. Re-fetches whenever `[symbol, interval, periods]` change; uses an `isCancelled` flag to drop stale responses. No polling.

### Response consumed

```ts
interface PacificaKlineResponse {
  success: boolean;
  data: Array<{ t: number; c: string }>; // open time ms, close price
  error: string | null;
}
```

Sorted ascending by `t`, then `data = sortedData.map(k => parseFloat(k.c))`.

### Consumers

- `apps/web/src/components/landing/shared/TickerCard.tsx:21` — `useKlineData(symbol, '1h', 48)`. **Landing-page only**, not in the trade terminal proper, but harmless to port.

---

## 5. `useStats()`

**File:** `apps/web/src/hooks/useStats.ts`

Platform-wide aggregate counters (mostly a landing-page widget). **Mixes terminal trading metrics with fight/game metrics** — see entanglements.

### Signature

```ts
export function useStats(): {
  stats: PlatformStats;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
};
```

### Data sources

1. **REST bootstrap once on mount:** `GET /api/stats` → `{ success, data: PlatformStats }`. Served by `apps/web/src/app/api/stats/route.ts` (`export const dynamic = 'force-dynamic'`, public/no-auth). It runs raw Prisma SQL over `trades` and `fight_trades` tables and counts `fight` rows.
2. **Live push via Socket.IO:** subscribes to event `platform:stats` through `useGlobalSocket()` (see [Realtime / WebSocket](./12-realtime-websocket.md)). Updates whenever the realtime service broadcasts.

### Returned shape

```ts
interface PlatformStats {
  tradingVolume: number;    // SUM(amount*price) over trades  — TERMINAL metric
  fightVolume: number;      // SUM(amount*price) over fight_trades — FIGHT metric
  fightsCompleted: number;  // count of FINISHED fights — FIGHT metric
  totalFees: number;        // SUM(fee) over trades — TERMINAL metric
  activeUsers: number;      // COUNT(DISTINCT user_id) over trades
  totalTrades: number;      // count of trades — TERMINAL metric
}
```

### Consumers

- `apps/web/src/components/landing/HeroSection.tsx:41` — `const { stats, isLoading: statsLoading } = useStats();`

---

## React Query / `queryClient.ts` note

`apps/web/src/lib/queryClient.ts` exports a singleton `QueryClient` with:

```ts
queries: {
  staleTime: 10 * 1000,        // 10s
  refetchOnWindowFocus: true,
  refetchOnMount: true,
  retry: 2,
  retryDelay: (i) => Math.min(1000 * 2 ** i, 10000),
  gcTime: 1000 * 60 * 60 * 24, // 24h
}
```

It also exports `persistNotificationReadState`, `isNotificationReadLocally`, `cleanupOldReadNotifications` (localStorage helpers under key `tfc_read_notifications`). **None of the five market-data hooks here touch it.** It is shared with non-React code so `notify.ts` and the global socket can call `queryClient.invalidateQueries(...)`. The query-backed hooks (positions/orders/fights/notifications) are documented elsewhere.

---

## Fight/duel entanglements in these files

- **`useStats` / `/api/stats`** blend terminal metrics (`tradingVolume`, `totalFees`, `totalTrades`) with fight-game metrics (`fightVolume`, `fightsCompleted`, querying `fight_trades` and `fight` tables). For a terminal-only rebuild, strip `fightVolume` and `fightsCompleted` and drop the `fight_trades`/`fight` queries from the route.
- **`useStats` realtime channel** rides on `useGlobalSocket` (`apps/web/src/hooks/useGlobalSocket.ts`), which is overwhelmingly a fight/arena/admin socket (`arena:fight_*`, `admin:*` events, `useStore` fight store, `useVideoStore`, `useNavigationStore`). The only terminal-relevant thing it carries is the `platform:stats` event. A terminal rebuild should either (a) get `platform:stats` over a plain socket, or (b) drop live stats entirely and poll `/api/stats`.
- **`usePrices` is consumed by `AiBiasWidget.tsx`** (an AI-bias *fight/game* feature). The hook itself is pure terminal market data — only this one consumer is game-related; ignore that consumer when migrating.
- `useOrderBook`, `useCandles`, `useKlineData` and the `/api/chart/candles` route contain **no fight logic** — clean to port as-is.

## Gaps / things the migrator must supply (not in these files)

- The chart route depends on `@/lib/server/pacifica` (Pacifica REST client: `getKlines`, `getMarkPriceKlines`) and `@/lib/server/exchanges/provider` (`ExchangeProvider.getAdapter('pacifica').getKlines`). Port or stub these — see [Pacifica integration](./11-pacifica-integration.md).
- Server error utilities: `@/lib/server/errors` and `@/lib/server/error-codes`.
- `/api/stats` needs a Prisma client `@/lib/server/db` and tables `trades`, `fight_trades`, `fight` (drop the latter two for terminal-only).
- `useStats` requires the Socket.IO realtime service emitting `platform:stats`; `useGlobalSocket` requires `NEXT_PUBLIC_WS_URL`, `socket.io-client`, `zustand`, `sonner`, and the `@/lib/store` / `@/lib/stores/*` stores (mostly fight-related).
- `symbolNames` (in `usePrices.ts`) and `SYMBOL_MAP` (in the chart route) are hard-coded lists — supply your own market universe.
- The chart component consuming `useCandles` expects `lightweight-charts` (time in seconds).
