# bridge-core

The framework-agnostic contract for **cross-chain funding** — bridging native
**USDC from Solana → an EVM chain (Arbitrum)** into the terminal's EVM wallet, so
a Solana-native UpDown user can fund HyperLiquid without leaving the app.

See [ADR-004 – Cross-Chain Funding](../../docs/Terminal-Migration/ADR-004-cross-chain-funding-bridge.md).

## What's here (Phase 1 scaffold)

Pure contract — **no provider logic, no external deps**:

- `types.ts` — `ChainId`, `Asset`, `BridgeName`, `BridgeRoute`, `QuoteParams`,
  `BridgeQuote`, `TransferStatusKind`, `TransferStatus`, `Unsigned/SignedSolanaTx`.
- `bridge-adapter.ts` — `interface BridgeAdapter` (`quote` → `buildSourceTx` →
  `submit` → `getStatus`). The client signs the Solana burn (the only signature);
  the provider/relayer drives the Circle attestation + EVM mint.
- `registry.ts` — `BridgeProvider` (registration model, mirrors `ExchangeProvider`).
  Concrete rails self-register on import; the funding UI depends only on this.

## Golden rule

bridge-core never imports a concrete provider. A rail (e.g. `bridge-lifi`, later
`bridge-cctp`) registers itself:

```ts
import { BridgeProvider } from 'bridge-core';
BridgeProvider.register('lifi', () => new LifiBridgeAdapter());
// app side:
BridgeProvider.configure({ defaultProvider: 'lifi' });
const bridge = BridgeProvider.get(); // -> BridgeAdapter
```

## Not built yet (next phases)

- `packages/bridge-lifi` — Phase-1 impl wrapping the LI.FI SDK over CCTP.
- `BridgeTransfer` Prisma model — durable async lifecycle (ADR-004 §6).
- `apps/terminal` funding panel + `useBridgeTransfer` hook + `app/api/bridge` routes.
- Open questions to settle first: destination-gas/relayer story (§8.2),
  aggregator vs CCTP-direct (§8.1).
