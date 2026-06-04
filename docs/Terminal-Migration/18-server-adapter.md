# Server Exchange Adapter Layer

Part of the Trading Terminal Migration set — see [README](./README.md).

This document describes the **server-side exchange adapter abstraction** that normalizes Pacifica (and, in theory, Hyperliquid/Binance) behind a single interface. It covers the adapter interface, the provider/factory, the Redis caching wrapper, the Pacifica implementation, and how API routes/services consume it. It also flags the DB (`@tfc/db` / Prisma) and auth dependencies the **terminal** needs versus those that are **fight-only**.

> Directory: `apps/web/src/lib/server/exchanges/`

---

## 1. Files at a glance

| File | Purpose |
|------|---------|
| `apps/web/src/lib/server/exchanges/adapter.ts` | Interface `ExchangeAdapter` + all normalized data types. No runtime code, just types. |
| `apps/web/src/lib/server/exchanges/pacifica-adapter.ts` | `PacificaAdapter implements ExchangeAdapter`. Wraps `lib/server/pacifica` + `lib/server/pacifica-signing`. The only real adapter. |
| `apps/web/src/lib/server/exchanges/cached-adapter.ts` | `CachedExchangeAdapter implements ExchangeAdapter`. Redis read-through cache + request dedup + invalidation. |
| `apps/web/src/lib/server/exchanges/provider.ts` | `ExchangeProvider` static factory. Picks adapter by name, wraps in cache if `REDIS_URL` set, memoizes singleton. |
| `apps/web/src/lib/server/exchanges/README.md` | Original author notes (caching TTLs, feature flag, setup). |
| `apps/web/src/lib/server/services/account.ts` | Account service that consumes the adapter (gated by `USE_EXCHANGE_ADAPTER`). |
| `apps/web/src/lib/server/auth.ts` | JWT verify + `withAuth()` wrapper used by every authed API route. |
| `apps/web/src/lib/server/db.ts` | Prisma singleton (`prisma`) used everywhere. |

**Migration takeaway:** Only the **Pacifica path** matters. Hyperliquid/Binance branches throw `not implemented`. You can port the whole `exchanges/` directory mostly verbatim, keep the Pacifica adapter, and delete the dead branches.

---

## 2. The `ExchangeAdapter` interface (`adapter.ts`)

The interface is split into three capability tiers. Reproduce the method signatures exactly:

```typescript
export interface ExchangeAdapter {
  readonly name: string;     // "pacifica"
  readonly version: string;  // "v1"

  // Public market data (no auth)
  getMarkets(): Promise<Market[]>;
  getPrices(): Promise<Price[]>;
  getOrderbook(symbol: string, aggLevel?: number): Promise<Orderbook>;
  getKlines(params: KlineParams): Promise<Candle[]>;
  getRecentTrades(symbol: string): Promise<RecentTrade[]>;

  // Account data (read, identified by accountId string)
  getAccount(accountId: string): Promise<Account>;
  getPositions(accountId: string): Promise<Position[]>;
  getOpenOrders(accountId: string): Promise<Order[]>;
  getTradeHistory(params: TradeHistoryParams): Promise<TradeHistoryItem[]>;
  getAccountSettings(accountId: string): Promise<AccountSetting[]>;

  // Trading (signing required; take an AuthContext)
  createMarketOrder(auth: AuthContext, params: MarketOrderParams): Promise<{ orderId: string | number }>;
  createLimitOrder(auth: AuthContext, params: LimitOrderParams): Promise<{ orderId: string | number }>;
  createStopOrder(auth: AuthContext, params: StopOrderParams): Promise<{ orderId: string | number }>;
  cancelOrder(auth: AuthContext, params: CancelOrderParams): Promise<{ success: boolean }>;
  cancelAllOrders(auth: AuthContext, params: CancelAllOrdersParams): Promise<{ cancelledCount: number }>;
  updateLeverage(auth: AuthContext, symbol: string, leverage: number): Promise<{ success: boolean }>;

  // Optional / exchange-specific
  approveBuilderCode?(auth: AuthContext, builderCode: string, maxFeeRate: number): Promise<{ success: boolean }>;
  withdraw?(auth: AuthContext, amount: string): Promise<{ success: boolean }>;
}
```

### Auth context (used only by the trading tier)

```typescript
export interface AuthContext {
  accountId: string;                 // Pacifica: accountAddress (EVM addr); HL: wallet; Binance: api key
  credentials: ExchangeCredentials;
}

export type ExchangeCredentials =
  | { type: 'pacifica';     privateKey: string }            // Base58 Ed25519 key
  | { type: 'hyperliquid';  privateKey: string }            // hex EVM key
  | { type: 'binance';      apiKey: string; apiSecret: string };
```

### Normalized data types (key fields)

All numeric values are **strings** (to preserve precision); timestamps are **epoch ms numbers**. Every type has a `metadata: Record<string, unknown>` escape hatch for exchange-specific fields. Signature summaries:

| Type | Notable fields |
|------|----------------|
| `Market` | `symbol` (`"BTC-USD"`), `baseAsset`, `quoteAsset`, `tickSize`, `stepSize`, `minOrderSize`, `maxOrderSize`, `minNotional`, `maxLeverage:number`, `fundingRate`, `fundingInterval:number` (hours), `metadata` |
| `Price` | `symbol`, `mark`, `index`, `last`, `bid`, `ask`, `funding`, `volume24h`, `change24h`, `timestamp` |
| `Orderbook` | `symbol`, `bids: [string,string][]` (`[price,size]`), `asks: [string,string][]`, `timestamp` |
| `Candle` | `timestamp`, `open`, `high`, `low`, `close`, `volume` |
| `RecentTrade` | `id`, `symbol`, `side: 'BUY'\|'SELL'`, `price`, `amount`, `timestamp` |
| `Account` | `accountId`, `balance`, `accountEquity`, `availableToSpend`, `marginUsed`, `unrealizedPnl`, `makerFee`, `takerFee`, `metadata` |
| `Position` | `symbol`, `side: 'LONG'\|'SHORT'`, `amount`, `entryPrice`, `markPrice`, `margin`, `leverage`, `unrealizedPnl`, `liquidationPrice`, `funding`, `metadata` |
| `Order` | `orderId`, `clientOrderId?`, `symbol`, `side`, `type: OrderType`, `price`, `amount`, `filled`, `remaining`, `status`, `timeInForce`, `reduceOnly`, `createdAt`, `updatedAt`, `metadata` |
| `TradeHistoryItem` | `historyId`, `orderId`, `symbol`, `side`, `amount`, `price`, `fee`, `pnl: string\|null`, `executedAt`, `metadata` |
| `AccountSetting` | `symbol`, `leverage:number`, `metadata` |

Enums:
```typescript
type OrderSide   = 'BUY' | 'SELL';
type OrderType   = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT' | 'TAKE_PROFIT_MARKET' | 'TAKE_PROFIT_LIMIT';
type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'POST_ONLY';
// Order['status'] = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED'
```

Request param shapes (`MarketOrderParams`, `LimitOrderParams`, `StopOrderParams`, `CancelOrderParams`, `CancelAllOrdersParams`, `KlineParams`, `TradeHistoryParams`) are all in `adapter.ts` — copy them verbatim; they are plain interfaces with no external deps.

---

## 3. Provider / factory (`provider.ts`)

`ExchangeProvider` is a static class with a `Map<string, ExchangeAdapter>` singleton cache.

```typescript
static getAdapter(exchangeName: 'pacifica' | 'hyperliquid' | 'binance'): ExchangeAdapter {
  if (this.adapters.has(exchangeName)) return this.adapters.get(exchangeName)!;

  let adapter: ExchangeAdapter;
  switch (exchangeName) {
    case 'pacifica':
      adapter = new PacificaAdapter(process.env.PACIFICA_BUILDER_CODE || 'TradeClub');
      break;
    case 'hyperliquid': throw new Error('Hyperliquid adapter not implemented yet');
    case 'binance':     throw new Error('Binance adapter not implemented yet');
    default:            throw new Error(`Unknown exchange: ${exchangeName}`);
  }

  if (process.env.REDIS_URL) {
    adapter = new CachedExchangeAdapter(adapter, process.env.REDIS_URL);
  }

  this.adapters.set(exchangeName, adapter);
  return adapter;
}
```

Two entry points:

- `getAdapter(name)` — synchronous, used for **public** data (markets/prices). No DB hit.
- `getUserAdapter(userId)` — **async**, intended to look up the user's `ExchangeConnection` and pick the exchange. **Currently a stub that always returns `getAdapter('pacifica')`** (the DB query is commented out). For a Pacifica-only migration you can keep it as-is or drop `userId` entirely.
- `clearCache()` — resets the singleton map (test helper).

**Caching is opt-in:** if `REDIS_URL` is unset, the raw `PacificaAdapter` is returned and every call hits Pacifica directly. Nothing breaks without Redis.

---

## 4. Caching wrapper (`cached-adapter.ts`)

`CachedExchangeAdapter` decorates any `ExchangeAdapter`. It uses `ioredis` and is intentionally **fail-open**: every Redis op is wrapped in a 1s `Promise.race` timeout and a try/catch that falls through to the underlying adapter. Redis errors are logged (`[CachedAdapter] ...`) but never thrown.

Redis client config (copy if you keep caching):
```typescript
new Redis(redisUrl, {
  connectTimeout: 5000,
  maxRetriesPerRequest: 2,
  enableReadyCheck: false,
  lazyConnect: true,
  tls: redisUrl.startsWith('rediss://') ? {} : undefined,
});
```

Cache key prefix is the adapter name, e.g. `pacifica:account:<addr>`.

### TTLs and strategy

| Method | Cache key | TTL | Strategy |
|--------|-----------|-----|----------|
| `getMarkets` | `markets:all` | 300s | `withCache` |
| `getPrices` | `prices:all` | 5s | `withCache` |
| `getOrderbook` | `orderbook:<sym>:<agg>` | 3s | `withCache` |
| `getKlines` | `klines:<sym>:<int>:<start>:<end>` | 3600s historical / 60s recent | `withCache` |
| `getRecentTrades` | `trades:recent:<sym>` | 5s | `withCache` |
| `getAccount` | `account:<id>` | 5s | `withCacheAndDedup` |
| `getPositions` | `positions:<id>` | 5s | `withCacheAndDedup` |
| `getOpenOrders` | `orders:<id>` | 3s | `withCacheAndDedup` |
| `getTradeHistory` | `trades:history:<id>:<sym>:<start>` | 10s | `withCache` |
| `getAccountSettings` | `settings:<id>` | 60s | `withCache` |

- **`withCache`** — read-through: GET key → on hit `JSON.parse`; on miss call fetcher, then fire-and-forget `setex`.
- **`withCacheAndDedup`** — same, plus an in-process `Map<string, Promise>` so concurrent requests for the same key share one in-flight fetch (collapses thundering herds on account data).
- **Trading methods are never cached.** After every write they call `invalidateAccountCache(accountId)` which `DEL`s `account:`, `positions:`, `orders:` for that account. `updateLeverage` additionally deletes `settings:<id>`.

The optional `approveBuilderCode?`/`withdraw?` are pass-throughs that throw if the wrapped adapter doesn't implement them.

---

## 5. Pacifica adapter (`pacifica-adapter.ts`)

`PacificaAdapter implements ExchangeAdapter`. `name = 'pacifica'`, `version = 'v1'`. It wraps:

- `import * as Pacifica from '../pacifica'` — the REST client (one method per Pacifica endpoint).
- `import * as PacificaSigning from '../pacifica-signing'` — Ed25519 signing.
- `import * as nacl from 'tweetnacl'` — keypair type.

Constructor takes a `builderCode` (default `process.env.PACIFICA_BUILDER_CODE || 'TradeClub'`).

### Symbol normalization (critical, copy verbatim)

```typescript
private normalizeSymbol(s: string): string   { return `${s}-USD`; }        // BTC   -> BTC-USD
private denormalizeSymbol(s: string): string { return s.replace('-USD',''); } // BTC-USD -> BTC
```

All adapter output symbols are `"<BASE>-USD"`; everything passed to the Pacifica client is the bare base asset.

### Side / type / TIF mapping

| Adapter | Pacifica |
|---------|----------|
| `BUY` | `bid` |
| `SELL` | `ask` |
| `LONG` position | side `bid` |
| `SHORT` position | side `ask` |
| TIF `POST_ONLY` → Pacifica `ALO`; `FOK` → `IOC`; `GTC`/`IOC` pass through | |
| Order type `market`/`limit`/`stop_loss_*`/`take_profit_*` ↔ `MARKET`/`LIMIT`/`STOP_*`/`TAKE_PROFIT_*` | |

`normalizeTradeSide` maps Pacifica's directional fill labels (`open_long`, `close_short`, …) to `BUY`/`SELL`: anything containing `long` or equal to `close_short` is `BUY`, else `SELL`.

### Signing (`extractKeypair`)

```typescript
private extractKeypair(auth: AuthContext): nacl.SignKeyPair {
  if (auth.credentials.type !== 'pacifica') throw new Error('Invalid credentials type for Pacifica adapter');
  return PacificaSigning.keypairFromPrivateKey(auth.credentials.privateKey);
}
```

Every trading method calls `extractKeypair(auth)` then the corresponding `Pacifica.create*Order(keypair, …)`. **This is the server-side-signing path** (server holds a Base58 Ed25519 key). See §7 for the caveat that the live order route does NOT use this.

### Known data gaps in the Pacifica mapping (carry these forward)

- `Price.bid`/`ask` = `'0'` (prices endpoint has no top-of-book), `last` = `mark`, `change24h` = `'0'`.
- `Position.markPrice` = `'0'` and `Position.unrealizedPnl` = `'0'` (not in Pacifica's positions response — must be joined from `getPrices()` if the UI needs it).
- `Account.unrealizedPnl` IS computed by summing `getPositions()` `unrealized_pnl` inside `getAccount()` (an extra positions fetch per account call).
- `Market.minNotional` = `'0'`; `fundingInterval` hardcoded to `8` (hours).
- `getKlines` prefers `Pacifica.getMarkPriceKlines` and falls back to `Pacifica.getKlines`.

---

## 6. How consumers use the adapter

### Public data routes (use the adapter directly)

`apps/web/src/app/api/markets/route.ts` is the canonical pattern:

```typescript
const USE_EXCHANGE_ADAPTER = process.env.USE_EXCHANGE_ADAPTER !== 'false';
// ...
if (USE_EXCHANGE_ADAPTER) {
  const adapter = ExchangeProvider.getAdapter('pacifica');
  const markets = await adapter.getMarkets();
  return Response.json({ success: true, data: markets });
}
// fallback: const Pacifica = await import('@/lib/server/pacifica'); ...
```

Same `getAdapter('pacifica')` + feature-flag pattern is used by the other public routes: `markets/prices`, `markets/[symbol]/orderbook`, `markets/[symbol]/klines`, `markets/[symbol]/trades`, `chart/candles`.

### Account service (uses `getUserAdapter`)

`apps/web/src/lib/server/services/account.ts` is the read-side consumer. Every method:
1. resolves `accountAddress` from `prisma.pacificaConnection.findUnique({ where: { userId } })` (throws `UnauthorizedError` if no active connection),
2. if `USE_EXCHANGE_ADAPTER` → `ExchangeProvider.getUserAdapter(userId)` then the matching adapter method,
3. else falls back to direct `Pacifica.*`.

`getSummary` additionally re-shapes the normalized `Account` into the camelCase object the frontend expects (`accountEquity`, `availableToWithdraw`, `pendingBalance`, `totalMarginUsed`, `crossMmr`, `positionsCount`, `ordersCount`, `feeLevel` — several pulled from `accountInfo.metadata`).

### Feature flag

`USE_EXCHANGE_ADAPTER` (default **on**; only `"false"` disables). Lets you A/B the adapter vs direct Pacifica calls. For migration you can hard-wire the adapter path and delete the fallback branches.

---

## 7. ⚠️ The trading-write path does NOT go through the adapter

This is the single most important thing for a migrator to understand.

The adapter exposes `createMarketOrder/createLimitOrder/...` with full server-side Ed25519 signing — **but the live order route does not call them.** `apps/web/src/app/api/orders/route.ts` (`POST`) instead:

1. Reads `account, symbol, side, type, amount, price, signature, timestamp, ...` from the request body — **the order is already signed client-side; the `signature` is passed in.**
2. Runs fight gating: `assertSymbolNotBlocked(...)` and `validateStakeLimit(...)` (both fight-only — see §8).
3. **Proxies the signed payload straight to `${PACIFICA_API_URL}/api/v1/orders/create_market` (etc.) via `fetch`** — bypassing `PacificaAdapter` entirely.
4. After success, calls `recordOrderAction(...)` and `recordAllTrades(...)` (DB + fight recording).

**Implication for migration:**
- The terminal's actual order placement uses the **client-side signing** Pacifica pattern (signature minted in the browser, server proxies). The adapter's trading methods + `AuthContext`/`ExchangeCredentials` are effectively a **parallel, unused server-signing path** kept for future exchanges.
- If your target project also signs client-side, you can **drop the trading tier of the adapter and the entire `AuthContext`/`extractKeypair`/`pacifica-signing` server-key machinery** and keep only the read/market methods.
- The cancel/edit/stop routes (`orders/[orderId]`, `orders/edit`, `orders/stop/*`, `orders/batch`) follow the same proxy-signed-payload pattern, not the adapter.

So: **adapter = read/market-data abstraction in practice.** Treat the write methods as documentation of intent, not the live code path.

---

## 8. DB & auth dependencies — terminal vs fight-only

The adapter directory itself has **zero `@tfc/db` imports** — it is pure exchange I/O. DB/auth coupling lives in the *consumers*. Split:

### Prisma singleton (`db.ts`) — TERMINAL-REQUIRED

```typescript
import { PrismaClient } from '@prisma/client';
export const prisma = global.prisma || new PrismaClient({ /* logs + explicit DATABASE_URL datasource */ });
```
Note: it imports `@prisma/client` directly (not `@tfc/db`) to dodge standalone-bundling issues, and explicitly passes `datasources.db.url = process.env.DATABASE_URL`. Requires env `DATABASE_URL`.

### Auth (`auth.ts`) — TERMINAL-REQUIRED

JWT bearer auth used by every authenticated terminal route (account/positions/orders).
- `withAuth(request, handler)` extracts `Bearer` token, `verifyToken` (HS256, secret `JWT_SECRET`), then looks up `prisma.user.findUnique({ where: { id: payload.sub }, select: { status, bannedReason } })` and **blocks `BANNED`/`DELETED` users**.
- Handler receives `{ userId, walletAddress }`. If it returns a `Response` it's passed through; otherwise wrapped as `{ success: true, data }`.
- `JwtPayload = { sub, walletAddress, role?, iat?, exp? }`.

The **only DB tables the read-side terminal truly needs**:

| Table | Used by | Why |
|-------|---------|-----|
| `User` | `auth.withAuth`, `order-actions` | auth status check + order-action userId |
| `PacificaConnection` | `services/account.ts` (`findUnique by userId`), `trade-recording` (`findUnique by accountAddress`) | maps `userId ↔ accountAddress` (the Pacifica EVM wallet). **This is the core terminal-account link.** |

> Reminder from project memory: always `.toLowerCase()` an EVM `accountAddress` before DB lookups.

### Fight-only DB/coupling — STRIP for terminal migration

These come in through the order route's call chain, not the adapter. None are needed for a pure terminal:

- **`apps/web/src/lib/server/orders.ts`** — despite the generic name, this is almost entirely **fight stake-limit logic**: `validateStakeLimit`, `assertSymbolNotBlocked`, `calculateFightExposure`, `getActiveFightForUser`, `calculateAvailableCapital`. Reads `fightParticipant`, raw-SQL `tfc_order_actions`, and live Pacifica positions/orders to enforce a per-fight capital cap. The only terminal-relevant helper here is `getCurrentPrice(symbol)` (thin wrapper over `Pacifica.getPrices()`). **Strip everything else.**
- **`apps/web/src/lib/server/trade-recording.ts`** — `recordAllTrades` / `recordAllTradesWithDetails` / `recordFightTradeWithDetails` / `emitStakeInfo*` / `emitPlatformStats`. Writes `Trade` **and** `FightTrade`, computes referral commissions (`calculateReferralCommissions`), broadcasts to admin realtime (`broadcastAdminTrade`), and emits stake-info/platform-stats to the realtime server. Tables touched: `trade`, `fightTrade`, `fightParticipant`, `fight`, `pacificaConnection`. **Almost all fight/referral/admin** — only the bare `Trade` insert is arguably terminal; the rest must be stripped or stubbed.
- **`apps/web/src/lib/server/order-actions.ts`** — `recordOrderAction` writes the `TfcOrderAction` audit row (used by fight exposure queries). Self-contained (only needs `User` + `TfcOrderAction`). It is best-effort (never throws). **Optional for terminal** — keep only if you want an order audit log; the fight system depends on it but the terminal UI does not.

### Env vars referenced in this layer

| Env var | Where | Notes |
|---------|-------|-------|
| `REDIS_URL` | `provider.ts`, `cached-adapter.ts` | optional; enables caching. Supports `rediss://` (TLS). |
| `USE_EXCHANGE_ADAPTER` | `markets/route.ts`, `services/account.ts` | default on; `"false"` = direct Pacifica. |
| `PACIFICA_BUILDER_CODE` | `provider.ts`, `pacifica-adapter.ts` | default `'TradeClub'`. |
| `PACIFICA_API_URL` | `orders/route.ts`, `trade-recording.ts` | default `https://api.pacifica.fi`. |
| `DATABASE_URL` | `db.ts` | required by Prisma. |
| `JWT_SECRET` | `auth.ts` | HS256 secret. |
| `REALTIME_URL`, `INTERNAL_API_KEY` | `trade-recording.ts` | **fight/realtime only** — strip. |

---

## 9. Migration recipe (Pacifica-only terminal)

1. Copy `exchanges/adapter.ts`, `exchanges/pacifica-adapter.ts`, `exchanges/cached-adapter.ts`, `exchanges/provider.ts` verbatim. Delete the `hyperliquid`/`binance` switch arms (or leave the throws).
2. Bring along `lib/server/pacifica` (REST client) and `lib/server/pacifica-signing` (only if you keep the adapter's trading methods; you can drop both `extractKeypair` and `pacifica-signing` if you sign client-side like the live route).
3. Keep `db.ts` + `auth.ts` + the `User`/`PacificaConnection` Prisma models. Drop `Fight*`, `TfcOrderAction`, referral, admin tables.
4. Wire public market routes to `ExchangeProvider.getAdapter('pacifica')` and account routes to `getUserAdapter(userId)` exactly as today.
5. For order placement, reuse the **client-signed proxy** pattern from `orders/route.ts` but **delete the `validateStakeLimit` / `assertSymbolNotBlocked` / `recordAllTrades` calls** (fight-only). Keep `recordOrderAction` only if you want an audit log.
6. `npm i ioredis tweetnacl jsonwebtoken @prisma/client` (+ `tweetnacl` only if keeping server signing).

---

### See also
- [Design tokens](./02-design-tokens-css.md) (sibling doc; replace if filename differs in this set's README).
</content>
