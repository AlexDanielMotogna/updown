# exchange-core

The framework-agnostic **contract** for trading-exchange integrations in the UpDown
Trading Terminal (HyperLiquid first, then Pacifica, Binance, …).

See [ADR-001](../../docs/Terminal-Migration/ADR-001-terminal-architecture.md) §5 for the
design and [ADR-003](../../docs/Terminal-Migration/ADR-003-identity-and-wallet-model.md)
for the chain/identity model this signer face encodes.

## Three faces

| Face | Where it runs | Responsibility |
|------|---------------|----------------|
| `ExchangeReadAdapter` | server | market data + account reads (cacheable, fail-open) |
| `ExchangeSigner` | **client** | chain-aware signing of writes (EVM/EIP-712, Solana/Ed25519) |
| `ExchangeStream` | browser → exchange | normalized realtime (orderbook / prices / account) |

All three are resolved via `ExchangeProvider` (the registry). Writes are **client-signed**
and go browser → exchange directly; the backend only reads/caches.

## Golden rule

`exchange-core` has **zero runtime dependencies** and never imports a concrete adapter.
Each exchange package self-registers:

```ts
// in exchange-hyperliquid/src/index.ts
import { ExchangeProvider } from 'exchange-core';
ExchangeProvider.register('hyperliquid', {
  read: () => new HyperliquidReadAdapter(),
  signer: () => new HyperliquidSigner(),
  stream: () => new HyperliquidStream(),
});
```

Then the app imports the package for its side effect and resolves by name:

```ts
import 'exchange-hyperliquid';            // registers itself
import { ExchangeProvider, InMemoryCacheStore } from 'exchange-core';

ExchangeProvider.configure({
  cacheStore: new InMemoryCacheStore(),   // or an ioredis-backed CacheStore in prod
  defaultExchange: 'hyperliquid',
  userResolver: (userId) => lookupExchangeForUser(userId), // reads the DB in the app
});

const markets = await ExchangeProvider.read('hyperliquid').getMarkets();
const { read, signer, stream } = await ExchangeProvider.forUser(userId);
```

## Caching

`CachedExchangeAdapter` wraps any `ExchangeReadAdapter` with a read-through cache over a
pluggable `CacheStore` (so the package doesn't depend on ioredis). It is **fail-open**:
store errors/timeouts fall through to the live exchange. Account reads are deduped.
TTL defaults live in `DEFAULT_TTLS`.

## Status

Phase 0 (per ADR-001 §6): contract + cache decorator + registry only — **no exchange
logic yet**. Next: `exchange-hyperliquid` (read + stream + EIP-712 signer).

## Scripts

```
pnpm --filter exchange-core typecheck
pnpm --filter exchange-core test
pnpm --filter exchange-core build
```
