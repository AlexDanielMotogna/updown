# WebSocket / Realtime Data

Part of the Trading Terminal Migration set — see [README](./README.md).

This doc covers every realtime data path the trading terminal uses:

1. **Direct Pacifica WebSocket** (`wss://ws.pacifica.fi/ws`) for market data + account data — used by 4 independent hooks/managers.
2. **socket.io to the in-house realtime server** (`apps/realtime`, default `:3002`) — primarily a fight/arena/admin bus. **Almost nothing terminal-specific flows over it.** Documented so you know what to strip vs. keep.

> **TL;DR for the migrator:** The terminal's live data (prices, orderbook, chart candles, your positions/orders/trades) all comes **directly from Pacifica's public WS**, not from our server. The socket.io server is essentially 100% fight/arena/admin and can be dropped entirely for a pure terminal, **except** that `usePacificaConnection` (an HTTP poll, not a socket) gates whether the wallet is linked. See related docs: [Market data & prices](./08-market-data-prices.md), [Orderbook](./09-orderbook.md), [Chart / TradingView](./10-chart-tradingview.md), [Positions & account](./11-positions-account.md).

---

## 1. Direct Pacifica WebSocket

**Endpoint:** `wss://ws.pacifica.fi/ws`
**Env var (only `usePacificaWebSocket` reads it):** `NEXT_PUBLIC_PACIFICA_WS_URL` (fallback `wss://ws.pacifica.fi/ws`). The other three consumers hard-code the URL — see Gaps.

There are **four separate, independent** Pacifica WS connections (no shared socket between them):

| Consumer | File | Channel(s) | Auth needed | Lifecycle owner |
|---|---|---|---|---|
| Market prices (all symbols) | `apps/web/src/hooks/usePrices.ts` | `prices` | No | hook (mounts with component) |
| Orderbook (one symbol) | `apps/web/src/hooks/useOrderBook.ts` | `book` | No | hook (re-connects per symbol/aggLevel) |
| Chart candles | `apps/web/src/lib/tradingview/WebSocketManager.ts` | `mark_price_candle` | No | singleton `wsManager` |
| Account positions/orders/trades | `apps/web/src/hooks/usePacificaWebSocket.ts` | `account_positions`, `account_orders`, `account_trades` | Wallet (account address) | hook + Zustand store, init'd by `<PacificaWebSocketInit/>` |

All four share the same envelope conventions:

- **Subscribe:** `{ "method": "subscribe", "params": { "source": "<channel>", ... } }`
- **Unsubscribe:** `{ "method": "unsubscribe", "params": { "source": "<channel>", ... } }`
- **Ping:** `{ "method": "ping" }` → server replies `{ "channel": "pong" }`
- **Incoming data:** `{ "channel": "<channel>", "data": <payload> }`

### 1a. Prices channel — `usePrices.ts`

**Subscribe (all symbols, no symbol param):**
```json
{ "method": "subscribe", "params": { "source": "prices" } }
```

**Incoming message** (`channel: "prices"`, `data` is an **array**):
```ts
interface PacificaWsPriceData {
  symbol: string;          // "BTC", "1000PEPE" (Pacifica format)
  mark: string;
  oracle: string;
  mid: string;
  funding: string;
  next_funding: string;
  open_interest: string;
  volume_24h: string;
  yesterday_price: string;
  timestamp: number;
}
// message = { channel: "prices", data: PacificaWsPriceData[] }
```

Notes:
- Symbol mapping: Pacifica `1000PEPE` ⇄ app `KPEPE-USD`; otherwise `BTC` ⇄ `BTC-USD` (`pacificaToSymbol` / `symbolToPacifica`). Same mapping repeated in every file.
- `change24h` is computed client-side from `oracle` vs `yesterday_price`. `high24h`/`low24h` are **faked** as `oracle * 1.02` / `oracle * 0.98` (Pacifica WS doesn't supply them).
- Market metadata (`max_leverage`, `tick_size`, `lot_size`) comes from a **REST** call `GET https://api.pacifica.fi/api/v1/info` (cached in module-level `marketInfoCache`), merged into each price object. Not a WS concern but co-located.
- The hook builds the `markets[]` list from WS data if REST is slow.

### 1b. Orderbook channel — `useOrderBook.ts`

Signature: `useOrderBook(symbol: string, aggLevel: AggLevel = 1)` where `AggLevel = 1 | 10 | 100 | 1000 | 10000` (multiplier of tick size).

**Subscribe (per symbol + aggregation level):**
```json
{ "method": "subscribe", "params": { "source": "book", "symbol": "BTC", "agg_level": 1 } }
```
**Unsubscribe sent on cleanup** with the identical params before `ws.close()`.

**Incoming message** (`channel: "book"`):
```ts
interface PacificaBookLevel { p: string; a: string; n: number; } // price, amount, #orders
interface PacificaBookMessage {
  channel: 'book';
  data: {
    s: string;                                        // symbol
    l: [PacificaBookLevel[], PacificaBookLevel[]];    // [bids, asks]
    t: number;                                        // timestamp
  };
}
```
Normalized to:
```ts
interface OrderBookLevel { price: number; size: number; orders: number; }
interface OrderBookData { symbol: string; bids: OrderBookLevel[]; asks: OrderBookLevel[]; timestamp: number; }
```
Guard: messages where `data.s !== pacificaSymbol` are ignored (stale-symbol protection). The effect resets state and **opens a fresh socket whenever `symbol` or `aggLevel` changes** — this hook does **not** reuse a connection.

### 1c. Chart candles channel — `WebSocketManager.ts` (singleton `wsManager`)

This is the only Pacifica consumer with multiplexed subscriptions over **one** socket (the TradingView datafeed registers/unregisters per chart). Exposes:

```ts
wsManager.subscribe(symbol, interval, onTick: (bar: Bar) => void, listenerGuid: string): void
wsManager.unsubscribe(listenerGuid: string): void
```

**Subscribe** (note: uses `mark_price_candle`, **not** `candle`, because mark-price candles are continuous/gapless):
```json
{ "method": "subscribe", "params": { "source": "mark_price_candle", "symbol": "BTC", "interval": "1m" } }
```
**Unsubscribe** sent only when no remaining subscription shares that `symbol:interval`.

**Incoming message** (`channel: "mark_price_candle"`):
```ts
interface PacificaCandleMessage {
  channel: 'mark_price_candle';
  data: {
    t: number; T: number;   // start ms, end ms
    s: string; i: string;   // symbol, interval
    o: string; c: string; h: string; l: string; v: string;
    n: number;              // #trades
  };
}
```
Mapped to `Bar { time: data.t /*ms*/, open, high, low, close, volume }` and fanned out to all subscriptions matching `symbol`+`interval`.

> A separate `trades` channel exists in Pacifica (`{ source: 'trades', symbol }`, message `channel: 'trades'`) and is referenced in `docs/Trading-Chart.md` but is **not** wired into any live terminal hook in this set.

### 1d. Account channels — `usePacificaWebSocket.ts`

The only **account-scoped** (authenticated-by-address) Pacifica connection. Drives the positions table, open-orders table, and trade history in the terminal. Backed by a Zustand store `usePacificaWsStore` so multiple components read the same data; the socket itself is owned by the hook, mounted exactly once via `<PacificaWebSocketInit/>` (renders `null`).

**Account = `publicKey.toBase58()`** from `@solana/wallet-adapter-react`. The hook only connects when `connected && publicKey`.

**Three subscribe messages sent on `onopen`:**
```json
{ "method": "subscribe", "params": { "source": "account_positions", "account": "<base58 pubkey>" } }
{ "method": "subscribe", "params": { "source": "account_orders",    "account": "<base58 pubkey>" } }
{ "method": "subscribe", "params": { "source": "account_trades",    "account": "<base58 pubkey>" } }
```

**Incoming message shapes** (terse single-char keys — these are the raw WS types):

```ts
// channel: "account_positions" → data: PacificaPositionWs[]
interface PacificaPositionWs {
  s: string;  d: string;  // symbol, side (bid/ask)
  a: string;  p: string;  // amount, entry price
  m: string;  f: string;  // margin, funding
  i: boolean; l: string|null; // isolated, liq price
  t: number;  li: number;     // timestamp, nonce
}

// channel: "account_orders" → data: PacificaOrderWs[]
interface PacificaOrderWs {
  i: number;  I: string|null; // order_id, client_order_id
  s: string;  d: string;      // symbol, side
  p: string;  a: string;      // price, amount
  f: string;  c: string;      // filled_amount, cancelled_amount
  t: number;  st: string|null;// timestamp, stop_type
  ot: string; sp: string|null;// order_type, stop_price
  ro: boolean; li: number;    // reduce_only, nonce
}

// channel: "account_trades" → data: PacificaTradeWs[]
interface PacificaTradeWs {
  h: number;  i: number;  I: string|null; // history_id, order_id, client_order_id
  u: string;  s: string;                  // account, symbol
  p: string;  o: string;  a: string;      // price, entry_price, amount
  te: string; ts: string; tc: string;     // trade_effect, trade_side, trade_cause
  f: string;  n: string;                  // fee, pnl
  t: number;  li: number;                 // timestamp, nonce
}
```

Normalized (`normalizePosition`/`normalizeOrder`/`normalizeTrade`) to friendly `Position`/`Order`/`Trade` interfaces (exported from the hook — see file for full shape). Store reducers:
- `updatePositions` — replaces entire list.
- `updateOrders` — **filters out** fully filled/cancelled orders (`a - f - c <= 0`) **but always keeps** TP/SL orders (`ot` includes `take_profit` or `stop_loss`).
- `addTrades` — merges + dedupes by `history_id`, sorts desc by `created_at`, caps at **100**.

**Other handled channels:** `pong` (ignored), `error` (`{ channel: "error", data: { message } }` → sets `error`).

### Connection lifecycle / reconnection / singleton (direct Pacifica)

| Consumer | Ping | Reconnect | Singleton? | Cleanup |
|---|---|---|---|---|
| `usePrices` | none | `setTimeout(connect, 3000)` on `onclose` | per-hook instance | closes ws + clears timeout on unmount |
| `useOrderBook` | none | `setTimeout(connect, 3000)` on `onclose` (guarded by `isCancelled`) | per-symbol/aggLevel | sends `unsubscribe`, closes ws |
| `wsManager` | none | `scheduleReconnect()` = `setTimeout(connect, 3000)`, only if `subscriptions.size > 0` | **yes** (module singleton). Closes after **5s idle** when last sub removed | per-`listenerGuid` |
| `usePacificaWebSocket` | **30s** `{method:'ping'}` | `setTimeout(connect, 3000)` on `onclose` **only if `event.code !== 1000`**; re-checks `publicKeyRef`/`connectedRef` before reconnecting | hook + Zustand store, mounted once via `PacificaWebSocketInit` | clears ping/reconnect timers, closes ws, `clearAll()` on wallet disconnect |

Key guards in `usePacificaWebSocket`:
- `isConnectingRef` prevents overlapping connects.
- Uses **refs** (`connectedRef`, `publicKeyRef`) inside WS callbacks to avoid stale closures.
- 100ms debounce before connecting after wallet state stabilizes.
- Reconnect effect keyed on `[connected, publicKey?.toBase58()]`.

---

## 2. socket.io to the in-house realtime server

**Client env var:** `NEXT_PUBLIC_WS_URL` (fallback `http://localhost:3002`).
**Server:** `apps/realtime/src/index.ts` — a raw `http.Server` + `socket.io` `Server`. Default port `REALTIME_PORT=3002`.

### Server-side rooms & events (`index.ts`)

The server has **no terminal market-data role at all.** Its responsibilities:
- `arena:subscribe` / `arena:unsubscribe` → join/leave `arena` room (fight lobby cards).
- `join_fight` / `leave_fight` → join/leave `fight:<id>` room; emits `FIGHT_STATE` snapshot on join.
- `admin:subscribe` (JWT, role must be `ADMIN`) / `admin:unsubscribe` → `admin` room.
- `disconnect`.
- **HTTP `/internal/*` endpoints** (guarded by `X-Internal-Key === INTERNAL_API_KEY`) called by the API server to trigger broadcasts (`/internal/arena/*`, `/internal/admin/*`, `/internal/platform-stats`, `/internal/stake-info`). These call into `FightEngine` (excluded from this migration).
- `/health` GET.
- A `FightEngine` tick loop + snapshot cleanup loop are started on boot.

CORS origins from `CORS_ORIGIN` (comma-sep) or default `['http://localhost:3001','http://localhost:3000']`. Transports `['websocket','polling']`.

> **Everything the realtime server emits is fight/arena/admin/platform-stats. None of it is chart/orderbook/price/position data for the terminal.** `pacifica-client.ts` (`getPrices`/`getPositions`/`getTradeHistory`) inside this server exists to **score fights**, not to feed the terminal UI.

### Client-side socket.io consumers

| Hook/file | Purpose | Terminal-relevant? |
|---|---|---|
| `useGlobalSocketStore` + `useGlobalSocket()` (`useGlobalSocket.ts`) | Persistent singleton socket; arena + admin + live-PnL bus | **No — fight/arena/admin only.** STRIP. |
| `useFightRoom(fightId)` (`useGlobalSocket.ts`) | `join_fight`/`leave_fight` | Fight only. STRIP. |
| `useAdminSubscription()` (`useGlobalSocket.ts`) | admin room | Admin only. STRIP. |
| `useSocket(fightId)` (`useSocket.ts`) | Per-fight room, PnL ticks, trade events, "ending soon" toast | Fight only. STRIP. |
| `useArenaSocket()` (`useArenaSocket.ts`) | Arena lobby fight list updates | **Fight only — see §3.** STRIP. |

The singleton pattern in `useGlobalSocket.ts` is worth noting if you keep any socket.io: a module-level `globalSocket` + `connectionPromise` ensure one shared connection; `getGlobalSocket(token)` resolves the same socket and stores it in Zustand. Reconnection config: `reconnectionAttempts: Infinity`, `reconnectionDelay: 1000`, `reconnectionDelayMax: 5000`, `timeout: 10000`, `transports: ['websocket']`, `auth: { token }`. On connect it emits `arena:subscribe`.

`useSocket.ts` connection config: `reconnectionAttempts: 10`, `reconnectionDelay: 1000`, `auth: { token }`, `query: { fightId }`.

---

## 3. `useArenaSocket` is fight-only — the boundary

`apps/web/src/hooks/useArenaSocket.ts` connects to the **realtime server** (`NEXT_PUBLIC_WS_URL`) and ONLY listens to arena/fight events:
`arena:fight_created`, `arena:fight_updated`, `arena:fight_started`, `arena:fight_ended`, `arena:fight_deleted`. It mutates the fight list in `useStore` (`addFight/updateFight/removeFight`). It emits `arena:subscribe` on connect and `arena:unsubscribe` on cleanup.

**It carries zero terminal/market data.** For a pure trading terminal, delete this hook and its call site in `apps/web/src/components/AppShell.tsx`. The same is true of `useSocket`, `useGlobalSocket`, `useFightRoom`, and `useAdminSubscription`.

**Clean boundary:** the only socket.io payloads that are even adjacent to trading are `TRADE_EVENT` / `PNL_TICK` in `useSocket.ts` — and those are *fight scoring* (a participant executed a trade inside a fight), not the user's terminal order flow. Terminal order/position truth comes exclusively from the **direct Pacifica `account_*` channels** (§1d).

---

## 4. `usePacificaConnection` — NOT a websocket

`apps/web/src/hooks/usePacificaConnection.ts` and `<PacificaConnectionSync/>` are an **HTTP poll**, included here only because they're commonly confused with the WS layer:

- React Query `GET /api/auth/pacifica/me` (Bearer token), `refetchInterval: 10000`, `refetchOnWindowFocus: true`, `refetchOnMount: 'always'`.
- Response shape used: `{ connected: boolean, pacificaAddress: string|null, connectedAt: string|null }`.
- Syncs `connected` into `useAuthStore.pacificaConnected`.
- `<PacificaConnectionSync/>` renders `null` and just logs status.

This gates whether the wallet is linked to a Pacifica account (server-side custody/agent-wallet check). Keep it for the terminal; it does not depend on the realtime server.

---

## Reproduction checklist (for the fresh repo)

1. Port the **four direct-Pacifica consumers** verbatim: `usePrices.ts`, `useOrderBook.ts`, `WebSocketManager.ts`, `usePacificaWebSocket.ts` (+ `PacificaWebSocketInit.tsx`). These give you prices, orderbook, chart, and account data with **no backend**.
2. Add `NEXT_PUBLIC_PACIFICA_WS_URL` env (or hard-code `wss://ws.pacifica.fi/ws`).
3. Keep `usePacificaConnection.ts` + the `/api/auth/pacifica/me` route if you keep the wallet-link gate.
4. **Drop** `useSocket.ts`, `useGlobalSocket.ts`, `useArenaSocket.ts`, and the entire `apps/realtime` server unless you also migrate fights.
