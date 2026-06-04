# Next.js API Routes (Terminal)

Part of the Trading Terminal Migration set — see [README](./README.md).

This document is the **backend contract** for the trading terminal's account and market-data endpoints. All routes live under `apps/web/src/app/api/` (Next.js 14 App Router; each route is a `route.ts` exporting HTTP-method functions). The frontend hooks/components in [Positions & Orders](./07-positions-orders.md) and [WebSocket / Realtime](./15-websocket-realtime.md) consume these.

> **Scope note:** None of these 11 routes contain duel/fight logic — they are pure terminal endpoints. The only entanglement is *indirect*: account routes resolve the user -> `PacificaConnection` via JWT (the same `User` table the fight layer uses), and `ExchangeProvider.getUserAdapter()` currently hard-codes Pacifica. See [Fight entanglements](#fight-entanglements--migration-notes) at the bottom.

---

## Summary table

| # | Method | Path | Auth | Calls | Purpose |
|---|--------|------|------|-------|---------|
| 1 | GET | `/api/account/summary` | JWT (`withAuth`) | `AccountService.getSummary(userId)` -> `adapter.getAccount()` | Balance / equity / margin overview |
| 2 | GET | `/api/account/positions` | JWT (`withAuth`) | `AccountService.getPositions(userId)` -> `adapter.getPositions()` | Open positions |
| 3 | GET | `/api/account/orders/open` | JWT (`withAuth`) | `AccountService.getOpenOrders(userId)` -> `adapter.getOpenOrders()` | Open (resting) orders |
| 4 | POST | `/api/account/leverage` | None (signature in body) | Proxy -> Pacifica `POST /api/v1/account/leverage` | Set per-symbol leverage |
| 5 | POST | `/api/account/margin` | None (signature in body) | Proxy -> Pacifica `POST /api/v1/account/margin` | Cross <-> isolated margin mode |
| 6 | POST | `/api/account/withdraw` | None (signature in body) | Proxy -> Pacifica `POST /api/v1/account/withdraw` | Withdraw USDC |
| 7 | GET | `/api/markets` | None (public) | `adapter.getMarkets()` | All market metadata |
| 8 | GET | `/api/markets/prices` | None (public) | `adapter.getPrices()` | All mark/index/last prices |
| 9 | GET | `/api/markets/[symbol]/klines` | None (public) | `adapter.getKlines()` | Historical candles |
| 10 | GET | `/api/markets/[symbol]/orderbook` | None (public) | `adapter.getOrderbook()` | L2 orderbook |
| 11 | GET | `/api/markets/[symbol]/trades` | None (public) | `adapter.getRecentTrades()` | Recent public trades |

**Two distinct patterns:**
- **Read endpoints** (1-3, 7-11) go through the **Exchange Adapter** (`ExchangeProvider`). GET account routes require a Bearer JWT; market routes are public.
- **Write/account-mutation endpoints** (4-6) are **thin proxies** to Pacifica — they require **no JWT**; instead the client signs the payload (Ed25519) and the route forwards `{ signature, timestamp }` plus `expiry_window: 5000`. See the Pacifica integration doc for how the signature is produced client-side.

---

## Shared infrastructure

### Auth wrapper — `withAuth`
File: `apps/web/src/lib/server/auth.ts`

```ts
withAuth<T>(
  request: Request,
  handler: (user: { userId: string; walletAddress: string }) => Promise<Response | T>
): Promise<Response>
```

- Reads `Authorization: Bearer <jwt>` header (`extractBearerToken`).
- Verifies JWT with `process.env.JWT_SECRET` (HS256, `jsonwebtoken`). Payload: `{ sub: userId, walletAddress, role }`, `expiresIn: 7d`.
- Looks up `User` in DB; throws 403 if `status === 'BANNED' | 'DELETED'`, 401 if missing.
- If the handler returns a plain value (not a `Response`), it is wrapped as `Response.json({ success: true, data: <value> })`.
- Errors: 401 `{ success:false, error }` (Unauthorized) / 403 (Forbidden); other errors re-thrown to the route's `errorResponse`.

### Error envelope — `errorResponse`
File: `apps/web/src/lib/server/errors.ts`. Every route wraps its body in `try { ... } catch (error) { return errorResponse(error); }`.

Error JSON shape (status from the thrown `ApiError` subclass):

```json
{
  "success": false,
  "error": "human message",
  "code": "ERR_VALIDATION_MISSING_FIELD",
  "errorId": "uuid",
  "details": {},
  "statusCode": 400
}
```

Relevant subclasses: `BadRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `ServiceUnavailableError` (503). Error codes are an enum in `apps/web/src/lib/server/error-codes.ts` (`ERR_VALIDATION_MISSING_FIELD`, `ERR_EXTERNAL_PACIFICA_API`, `ERR_ORDER_INVALID_AMOUNT`, ...).

### Success envelope
All read routes return `{ "success": true, "data": <payload> }`.

### Exchange adapter / feature flag
Files: `apps/web/src/lib/server/exchanges/provider.ts`, `adapter.ts`, `services/account.ts`.

- `const USE_EXCHANGE_ADAPTER = process.env.USE_EXCHANGE_ADAPTER !== 'false';` — defaults **on**. When off, routes fall back to direct `@/lib/server/pacifica` calls (snake_case -> camelCase mapped in `services/account.ts`).
- `ExchangeProvider.getAdapter('pacifica')` -> singleton `PacificaAdapter(process.env.PACIFICA_BUILDER_CODE || 'TradeClub')`, optionally wrapped in `CachedExchangeAdapter` when `process.env.REDIS_URL` is set.
- `ExchangeProvider.getUserAdapter(userId)` currently **always returns the Pacifica adapter** (DB lookup is a TODO stub).

---

## Account routes

### 1. GET `/api/account/summary`
File: `apps/web/src/app/api/account/summary/route.ts`

- **Auth:** JWT required.
- **Params/body:** none.
- **Server fn:** `AccountService.getSummary(user.userId)`. Resolves `accountAddress` from `prisma.pacificaConnection.findUnique({ where: { userId } })` (throws `UnauthorizedError('No active Pacifica connection')` if missing/inactive), then `adapter.getAccount(accountAddress)`.
- **Response** (`data`, or `null` if no account):

```ts
{
  balance: string;
  accountEquity: string;
  availableToSpend: string;
  availableToWithdraw: string;
  pendingBalance: string;       // '0' default
  totalMarginUsed: string;
  crossMmr: string;             // '0' default
  positionsCount: number;
  ordersCount: number;
  feeLevel: number;
}
```

### 2. GET `/api/account/positions`
File: `apps/web/src/app/api/account/positions/route.ts`

- **Auth:** JWT required. **Body:** none.
- **Server fn:** `AccountService.getPositions(userId)` -> `adapter.getPositions(accountAddress)`.
- **Response:** `data: Position[]` (normalized `Position` from `adapter.ts`):

```ts
{
  symbol: string;            // "BTC-USD"
  side: 'LONG' | 'SHORT';
  amount: string;
  entryPrice: string;
  markPrice: string;
  margin: string;
  leverage: string;
  unrealizedPnl: string;
  liquidationPrice: string;
  funding: string;
  metadata: Record<string, unknown>;
}
```

### 3. GET `/api/account/orders/open`
File: `apps/web/src/app/api/account/orders/open/route.ts`

- **Auth:** JWT required. **Body:** none.
- **Server fn:** `AccountService.getOpenOrders(userId)` -> `adapter.getOpenOrders(accountAddress)`.
- **Response:** `data: Order[]`:

```ts
{
  orderId: string | number;
  clientOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT' | 'TAKE_PROFIT_MARKET' | 'TAKE_PROFIT_LIMIT';
  price: string;
  amount: string;
  filled: string;
  remaining: string;
  status: 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  timeInForce: 'GTC' | 'IOC' | 'FOK' | 'POST_ONLY';
  reduceOnly: boolean;
  createdAt: number;         // epoch ms
  updatedAt: number;
  metadata: Record<string, unknown>;
}
```

### 4. POST `/api/account/leverage`
File: `apps/web/src/app/api/account/leverage/route.ts`

- **Auth:** none (client-signed payload).
- **Request body:**

```ts
{
  account: string;     // Pacifica account address
  symbol: string;      // e.g. "BTC"
  leverage: number | string;  // parsed with parseInt()
  signature: any;      // Pacifica signature object
  timestamp: number;
}
```

All five fields required -> else `BadRequestError(ERR_VALIDATION_MISSING_FIELD)`.
- **Proxy target:** `POST ${PACIFICA_API_URL}/api/v1/account/leverage` with body `{ account, symbol, leverage: parseInt(leverage), signature, timestamp, expiry_window: 5000 }`. (`PACIFICA_API_URL` defaults to `https://api.pacifica.fi`.)
- **Response:** `{ success: true, data: <pacifica result.data> }`. Pacifica failure (`!response.ok || !result.success`) -> `ServiceUnavailableError(503, ERR_EXTERNAL_PACIFICA_API)`.

### 5. POST `/api/account/margin`
File: `apps/web/src/app/api/account/margin/route.ts`

- **Auth:** none (client-signed). **Body:**

```ts
{
  account: string;
  symbol: string;
  is_isolated: boolean;   // validated via `=== undefined`, so false is accepted
  signature: any;
  timestamp: number;
}
```

- **Proxy target:** `POST ${PACIFICA_API_URL}/api/v1/account/margin`, body `{ account, symbol, is_isolated, signature, timestamp, expiry_window: 5000 }`.
- **Response:** `{ success: true, data: <pacifica result.data> }`. Same error handling as leverage.

### 6. POST `/api/account/withdraw`
File: `apps/web/src/app/api/account/withdraw/route.ts`

- **Auth:** none (client-signed). **Body:**

```ts
{
  account: string;
  amount: string | number;   // must parse to > 0, else BadRequestError(ERR_ORDER_INVALID_AMOUNT)
  signature: any;
  timestamp: number;
}
```

- **Proxy target:** `POST ${PACIFICA_API_URL}/api/v1/account/withdraw`, body `{ account, amount, signature, timestamp, expiry_window: 5000 }`. Note `amount` is forwarded **as received** (not the parsed number).
- **Response:** `{ success: true, data: <pacifica result.data> }`.

---

## Market-data routes (all public, all GET)

### 7. GET `/api/markets`
File: `apps/web/src/app/api/markets/route.ts`. No params. -> `adapter.getMarkets()`.
- **Response:** `data: Market[]`:

```ts
{
  symbol: string;          // "BTC-USD"
  baseAsset: string;       // "BTC"
  quoteAsset: string;      // "USD"
  tickSize: string;
  stepSize: string;
  minOrderSize: string;
  maxOrderSize: string;
  minNotional: string;
  maxLeverage: number;
  fundingRate: string;
  fundingInterval: number; // hours
  metadata: Record<string, unknown>;
}
```

### 8. GET `/api/markets/prices`
File: `apps/web/src/app/api/markets/prices/route.ts`. No params. -> `adapter.getPrices()`.
- **Response:** `data: Price[]`:

```ts
{
  symbol: string;          // "BTC-USD"
  mark: string;
  index: string;
  last: string;
  bid: string;
  ask: string;
  funding: string;
  volume24h: string;
  change24h: string;       // percent
  timestamp: number;       // epoch ms
}
```

### 9. GET `/api/markets/[symbol]/klines`
File: `apps/web/src/app/api/markets/[symbol]/klines/route.ts`

- **Path param:** `symbol` (e.g. `BTC` or `BTC-USD`). The route normalizes: if `symbol` does not include `-USD` it appends `-USD`.
- **Query params:**

  | param | required | notes |
  |-------|----------|-------|
  | `interval` | yes | "1m","5m","15m","1h","4h","1d" |
  | `startTime` | yes | epoch ms (parsed `parseInt(...,10)`) |
  | `endTime` | no | epoch ms |

  Missing `interval` or `startTime` -> `BadRequestError(ERR_VALIDATION_MISSING_FIELD)`.
- **Server fn:** `adapter.getKlines({ symbol, interval, startTime, endTime })`.
- **Response:** `data: Candle[]`:

```ts
{ timestamp: number; open: string; high: string; low: string; close: string; volume: string; }
```

### 10. GET `/api/markets/[symbol]/orderbook`
File: `apps/web/src/app/api/markets/[symbol]/orderbook/route.ts`

- **Path param:** `symbol` (normalized to `-USD` as above).
- **Query param:** `aggLevel` (optional, default `1`, `parseInt(...,10)`) — price aggregation level.
- **Server fn:** `adapter.getOrderbook(normalizedSymbol, aggLevel)`.
- **Response:** `data: Orderbook`:

```ts
{
  symbol: string;
  bids: [string, string][];   // [price, size]
  asks: [string, string][];
  timestamp: number;
}
```

### 11. GET `/api/markets/[symbol]/trades`
File: `apps/web/src/app/api/markets/[symbol]/trades/route.ts`

- **Path param:** `symbol` (normalized to `-USD`). No query params.
- **Server fn:** `adapter.getRecentTrades(normalizedSymbol)`.
- **Response:** `data: RecentTrade[]`:

```ts
{
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: string;
  amount: string;
  timestamp: number;
}
```

---

## Environment variables used by these routes

| Var | Default | Used by |
|-----|---------|---------|
| `JWT_SECRET` | `dev-jwt-secret-not-for-production` | `withAuth` (routes 1-3) |
| `PACIFICA_API_URL` | `https://api.pacifica.fi` | leverage, margin, withdraw proxies |
| `USE_EXCHANGE_ADAPTER` | `'true'` (anything `!== 'false'`) | all read routes + `AccountService` |
| `PACIFICA_BUILDER_CODE` | `'TradeClub'` | `PacificaAdapter` construction in `ExchangeProvider` |
| `REDIS_URL` | (unset) | enables `CachedExchangeAdapter` wrapping |
| `EXCHANGE_KEY_ENCRYPTION_SECRET` | (unset) | agent-wallet decryption (used by trading/order routes, not these read routes) |

---

## Fight entanglements & migration notes

These 11 routes are **clean of duel/fight code**, but watch for these coupling points when lifting them into a fresh repo:

1. **`User` status gate in `withAuth`** (`auth.ts`): account GET routes 403 BANNED/DELETED users. The `User.status` / `bannedReason` columns are shared with the fight/anti-cheat layer. In a terminal-only repo you can drop the status check or keep a slimmed `User` table.
2. **`PacificaConnection` lookup** (`services/account.ts` -> `getAccountAddress`): account routes require a `prisma.pacificaConnection` row keyed by `userId`. This is the terminal<->user binding; not fight-specific, but pulls in the Prisma schema + JWT-issued `userId`.
3. **`ExchangeProvider.getUserAdapter()`** is a stub that ignores `userId` and always returns Pacifica. The migrator must wire real per-user exchange selection (or keep Pacifica-only).
4. The **leverage/margin/withdraw** proxies trust a client-supplied `account` + `signature` with **no JWT** — there is no server-side check that the JWT user owns that `account`. Preserve or harden as desired, but note the behavior.

## Gaps the migrator must supply

- `@/lib/server/error-codes.ts` (`ErrorCode` enum) and `@/lib/server/logger.ts` (`errorLogger`) — imported by `errors.ts`.
- `@/lib/server/db.ts` (`prisma`) and the Prisma `User` + `PacificaConnection` models.
- `@/lib/server/pacifica.ts` (direct-call fallback, only when `USE_EXCHANGE_ADAPTER=false`).
- `PacificaAdapter` + `CachedExchangeAdapter` implementations behind `ExchangeProvider`.
- The client-side Ed25519 signing that produces `{ signature, timestamp }` for routes 4-6 (see Pacifica integration doc).
