# exchange-hyperliquid

HyperLiquid implementation of the [`exchange-core`](../exchange-core) contract.

Importing the package self-registers it with the provider:

```ts
import 'exchange-hyperliquid';                 // registers 'hyperliquid'
import { ExchangeProvider } from 'exchange-core';

const markets = await ExchangeProvider.read('hyperliquid').getMarkets();
```

Or use the adapter directly (e.g. against testnet):

```ts
import { HyperliquidReadAdapter, TESTNET } from 'exchange-hyperliquid';
const a = new HyperliquidReadAdapter({ endpoint: TESTNET });
```

## Status (Phase 1)

| Face | State |
|------|-------|
| `HyperliquidReadAdapter` | ✅ implemented over the public `info` endpoint (markets, prices, orderbook, klines, recent trades, account, positions, open orders, trade history) |
| `HyperliquidStream` | ✅ implemented over the WS (`l2Book`, `allMids`, `clearinghouseState`/`openOrders`/`userFills`) with reconnect + ref-counted subs |
| `HyperliquidSigner` | ⛔ stub — Phase 1 step 2 (EIP-712 agent-wallet via a vetted TS SDK; needs a testnet key to verify) |

## Notes

- **Symbols:** public surface uses `"<BASE>-USD"`; HL uses the bare coin (`BTC`).
  See `symbols.ts`.
- **Addresses:** account reads lowercase the EVM address and use the user's
  **real** address — never an agent address (ADR-003).
- **tickSize/stepSize** are derived from `szDecimals` (`step = 10^-szDecimals`,
  `tick = 10^-(6 - szDecimals)`). This is an approximation of HL's precision
  rules (it also caps at 5 significant figures); the signer will enforce exact
  formatting when it lands.
- **No runtime deps** beyond `exchange-core`. Uses the global `fetch` (injectable
  for tests).

The read adapter was verified live against HyperLiquid mainnet (230 markets,
correct BTC mark/orderbook/candles) and has an offline vitest suite over
fixtures.
