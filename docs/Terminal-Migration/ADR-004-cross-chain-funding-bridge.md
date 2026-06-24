# ADR-004 — Cross-Chain Funding (bridge USDC Solana → EVM, into the terminal wallet)

- **Status:** Proposed
- **Scope:** How a user moves **USDC from their Solana wallet** (where UpDown betting funds live) to
  **USDC on an EVM chain** (Arbitrum) in the **EVM wallet connected to the terminal**, so they can
  fund HyperLiquid without leaving the app. Covers the bridge rail, where it lives in the monorepo,
  the transfer lifecycle, and how it ties into the existing wallet model.
- **Builds on:** [ADR-001 – Terminal Architecture](./ADR-001-terminal-architecture.md)
  (`packages/exchange-*` pattern + the three-faces adapter; this ADR adds a sibling `bridge-*`
  package) and [ADR-003 – Identity & Wallet Model](./ADR-003-identity-and-wallet-model.md)
  (one identity / N linked wallets / **dual custody**: Solana = betting, EVM = trading). ADR-003
  decided *who the user is across both chains*; **this ADR decides how value moves between those two
  custody contexts.** It does not change either's topology.

---

## 1. Context

The terminal trades on **HyperLiquid, which settles on Arbitrum (EVM)** — deposits are USDC on
Arbitrum. UpDown users hold their money as **USDC on Solana** (the Anchor betting program). So the
moment a Solana-native user wants to trade, there is a hard gap: *their money is on the wrong chain.*

Today closing that gap is a manual, multi-tool chore: withdraw to an exchange, swap/bridge, deposit
to Arbitrum, fund HyperLiquid — several apps, several signatures, several ways to lose funds. The
goal of this ADR is to make it **one in-app action**: "Move $X from Solana to my trading wallet."

Facts that drive the design:

1. **USDC is the same asset on both chains, but not the same token.** Solana USDC (SPL) and Arbitrum
   USDC (ERC-20) are distinct mints/contracts. Moving value means a **cross-chain transfer**, not a
   swap.
2. **Circle issues USDC natively on both chains** and runs **CCTP** (Cross-Chain Transfer Protocol):
   burn USDC on the source chain, mint **native** USDC on the destination — **1:1, no wrapped
   token, no liquidity pool to drain.** This is the canonical rail for USDC specifically.
3. **Bridging is asynchronous and two-legged.** CCTP = `burn` on Solana → Circle **attestation** →
   `receiveMessage` (mint) on the EVM chain. The mint leg needs gas on the destination **or a
   relayer**. Standard transfers are bounded by Solana finality (~min); **CCTP V2 Fast Transfer**
   is seconds for a small fee.
4. **The terminal already has the destination address.** Per ADR-003 we store the user's real
   `evmAddress` (a `WalletLink` with `chain: 'evm'`). The bridge recipient is exactly that address —
   the EVM wallet **does not need to sign**; only the Solana side signs the burn.
5. **The monorepo already has the right seam.** ADR-001 established `packages/exchange-*` behind a
   stable contract. A bridge is the same shape of problem (an external rail, normalized behind an
   interface, possibly multiple providers) → it earns its own `packages/bridge-*` package, not code
   buried in `apps/terminal`.

---

## 2. Decision

**Add an in-app cross-chain funding flow built on Circle CCTP, abstracted behind a
`packages/bridge-core` contract, with the EVM wallet as recipient and the transfer tracked as a
first-class async lifecycle.**

- **Rail = Circle CCTP** (native USDC burn-and-mint). No wrapped USDC, no third-party liquidity
  risk. Default to **CCTP V2 Fast Transfer** where available, Standard as fallback.
- **Integrate via a bridge SDK/aggregator, not hand-rolled CCTP, for Phase 1.** A vetted aggregator
  (**LI.FI** first choice; **Mayan** / **deBridge** as alternates) wraps CCTP **plus the relayer +
  destination-gas handling**, so the user **signs once on Solana** and USDC simply appears on
  Arbitrum. We keep the option to drop to **CCTP-direct** later for zero third-party dependency.
- **Recipient = the user's stored `evmAddress`** (ADR-003 `WalletLink`). The EVM wallet is a
  destination, not a signer. Source = the user's Solana wallet (signs the burn).
- **The transfer is a tracked lifecycle, not fire-and-forget.** A `BridgeTransfer` row records every
  state (`initiated → burned → attested → minting → completed | failed`) so the UI can poll, resume,
  and surface honest "pending / failed / recovered" states — mirroring how Solana on-chain flows are
  already tracked.
- **Funding HyperLiquid is a separate, optional second leg.** The bridge's job ends when USDC lands
  on Arbitrum in the user's EVM wallet. Chaining the HyperLiquid deposit afterward is a follow-up
  step (it may even target the HL deposit bridge directly), decided alongside ADR-003's agent flow —
  **out of scope here** beyond leaving the seam.

**Principle: bridge the *native* asset behind a stable interface; treat the transfer as durable async
state, never a single blind call.**

---

## 3. Options considered

| Dimension | A: manual (status quo) | ★ CCTP via aggregator SDK (LI.FI/Mayan/deBridge) | B: CCTP direct (self-relayed) | C: Wormhole/Portal wrapped |
|---|---|---|---|---|
| In-app, one signature | ❌ several apps | ✅ sign once on Solana | ⚠️ we run the relayer | ✅/⚠️ |
| Native USDC (no wrapped) | ✅ | ✅ (CCTP under the hood) | ✅ | ❌ wrapped unless +CCTP |
| Liquidity-pool risk | n/a | ✅ none (burn/mint) | ✅ none | ❌ pool/peg risk |
| Destination gas / relayer handled | n/a | ✅ by the SDK | ❌ we build it | ⚠️ varies |
| Time-to-ship | n/a | ✅ low (SDK + widget) | ❌ high (relayer, attestation polling) | medium |
| Third-party dependency | none | ⚠️ one aggregator | ✅ only Circle | ⚠️ bridge + guardians |
| Fast (sub-minute) option | ❌ | ✅ CCTP V2 Fast | ✅ if we implement it | ⚠️ |
| Exit cost if we leave it | n/a | ✅ low (swap adapter) | ✅ | medium |

A is the current pain we're removing. C reintroduces wrapped-asset / peg risk that CCTP exists to
avoid. B is the right *long-term* zero-dependency target but front-loads relayer + attestation
plumbing we don't need to own on day one. ★ ships the same UX on the same rail (CCTP) while deferring
the relayer build — and because it sits behind `bridge-core`, swapping the aggregator for CCTP-direct
later is one adapter, **zero UI change**.

---

## 4. Architecture — where it lives

Sibling to the `exchange-*` packages from ADR-001 §4, same golden rule (the app depends only on the
`-core` contract; the registry resolves the concrete provider):

```
packages/
├── exchange-core/                 # ADR-001 (the trading contract)
├── exchange-hyperliquid/          # ADR-001
├── bridge-core/                   # NEW — the bridge contract (framework-agnostic)
│   └── src/
│       ├── types.ts               # ChainId, Asset (USDC), Quote, BridgeRoute, TransferStatus
│       ├── bridge-adapter.ts      # interface BridgeAdapter (quote / build / track)
│       └── registry.ts            # BridgeProvider.get('lifi' | 'cctp' | …)
└── bridge-lifi/                   # NEW — Phase-1 impl (LI.FI SDK wrapping CCTP)
    └── src/                       #        (later: bridge-cctp/ for self-relayed direct)

apps/terminal/
└── src/
    ├── components/funding/        # "Move funds" panel/modal (source amount, route, status)
    ├── hooks/useBridgeTransfer.ts # quote + initiate + poll lifecycle
    └── app/api/bridge/            # read/proxy: quotes, attestation status, transfer record
```

```ts
// packages/bridge-core/src/bridge-adapter.ts
export interface BridgeAdapter {
  readonly name: BridgeName;                 // 'lifi' | 'cctp' | 'mayan' | …
  quote(p: QuoteParams): Promise<BridgeQuote>;       // amount, fees, eta, route (CCTP fast/standard)
  // CLIENT signs the source-chain (Solana) burn; SDK/relayer handles the EVM mint leg
  buildSourceTx(q: BridgeQuote): Promise<UnsignedSolanaTx>;
  submit(signed: SignedSolanaTx): Promise<{ transferId: string }>;
  getStatus(transferId: string): Promise<TransferStatus>;  // for polling / resume
}
```

- **Source signing reuses the existing Solana wallet path** — the user already signs Solana txs for
  betting; the burn is just another Solana tx. The EVM wallet is read-only here (recipient).
- **`BridgeProvider.get()`** mirrors `ExchangeProvider` — the funding UI never imports `bridge-lifi`
  directly; switching to `bridge-cctp` is a registry arm.

---

## 5. Flow

```
 1. User opens "Move funds" in the terminal, enters amount (USDC).
 2. quote()  → shows: amount out, bridge+gas fee, ETA, route (CCTP Fast vs Standard).
 3. Recipient = stored evmAddress (ADR-003). Source = connected Solana wallet.
 4. User confirms → buildSourceTx() → SOLANA wallet signs the burn  ← the only signature.
 5. submit() → record BridgeTransfer(initiated). Aggregator/relayer drives:
        burn (Solana) → Circle attestation → mint (Arbitrum) to evmAddress.
 6. useBridgeTransfer polls getStatus():  burned → attested → minting → completed.
 7. UI shows live status; on completed, USDC is in the EVM wallet, ready to fund HyperLiquid.
        (Funding HL = optional follow-up leg, out of scope — see §2.)
```

The EVM wallet **never pops a signature** in this flow. Failure at any leg leaves the
`BridgeTransfer` in a recoverable state with a clear message, never a silent loss.

---

## 6. Data model

```
BridgeTransfer (NEW — 1 per funding action, the durable async state)
 ├─ id
 ├─ userId          → User.id (ADR-003 identity)
 ├─ provider        'lifi' | 'cctp' | …
 ├─ asset           'USDC'
 ├─ sourceChain     'solana'      sourceAddress  (the user's SPL wallet)
 ├─ destChain       'arbitrum'    destAddress    (the user's evmAddress — ADR-003 WalletLink)
 ├─ amountIn / amountOut / feeTotal
 ├─ route           'cctp-fast' | 'cctp-standard'
 ├─ status          'initiated' | 'burned' | 'attested' | 'minting' | 'completed' | 'failed'
 ├─ sourceTxSig     // Solana burn signature
 ├─ attestationRef  // Circle attestation id / message hash
 ├─ destTxHash      // EVM mint tx
 └─ createdAt / updatedAt
```

- **One owner across both legs.** `userId` ties the Solana source and EVM destination to the same
  ADR-003 identity — the same join key the unified Portfolio already uses.
- **`destAddress` is read from the existing `WalletLink(chain:'evm')`** — no new wallet concept; the
  bridge consumes the wallet model ADR-003 already defines.
- **Lowercase the EVM `destAddress`** before storing (consistency with ADR-003's EVM handling).
- **Status is the source of truth for resume.** A page reload or transient RPC failure resumes from
  the row, not from in-memory state.

---

## 7. Consequences

**Positive**
- A Solana-native UpDown user can fund the terminal **without leaving the app** — one signature,
  native USDC, no wrapped-asset or pool risk.
- Built on the same `-core` + registry seam as `exchange-*`: the rail (aggregator → CCTP-direct) is
  swappable with **zero UI change**, and adding a second asset/chain is additive.
- Reuses ADR-003's wallet model wholesale (recipient = stored `evmAddress`); no new identity surface.
- The transfer lifecycle gives honest, resumable status — consistent with how Solana flows are
  already tracked, not a blind cross-chain "hope it lands."

**Negative / costs**
- A new package + a `BridgeTransfer` table + polling/resume UI to build and maintain.
- Phase 1 takes a dependency on an external aggregator (LI.FI/Mayan/deBridge) — uptime, fee changes,
  route availability are now partly theirs. Mitigated by the swap-to-CCTP-direct exit.
- Cross-chain async UX is genuinely harder than a single-chain tx — partial/failed states,
  attestation delays, fee/ETA disclosure must all be handled well.

---

## 8. Risks & open questions

1. **Aggregator vs CCTP-direct (top decision).** Ship Phase 1 on an aggregator SDK for speed; keep
   `bridge-core` clean enough that a `bridge-cctp` (self-relayed, zero third-party) is a drop-in
   later. Decide the trigger to migrate (volume? fee? reliability?).
2. **Destination gas.** Minting on Arbitrum needs gas. Confirm the chosen SDK sponsors/relays it (so
   a user with **zero ETH** can still receive). If not, we need a gas-drop or relayer — a gating
   requirement, not a nice-to-have.
3. **Fee & ETA honesty.** Show bridge fee + gas + route (Fast vs Standard) **before** the signature.
   Never surprise the user post-burn.
4. **Failure & resume.** Define recovery for each leg (burn ok / attestation stuck / mint failed).
   The `BridgeTransfer` row + `getStatus()` polling must make every stuck transfer recoverable and
   visible — no silent loss.
5. **Chain/asset scope.** Phase 1 = USDC, Solana → Arbitrum (HyperLiquid's chain) only. Resist
   broadening to N chains/assets until the single happy path is solid.
6. **Direction (withdrawal).** This ADR is **Solana → EVM** (funding). The reverse (EVM → Solana,
   cashing out trading profits back to betting) is the symmetric case — same package, deferred to a
   follow-up; CCTP is bidirectional so the rail already supports it.
7. **Min/dust amounts & limits.** CCTP and aggregators have minimums and per-tx caps; enforce and
   surface them in `quote()`.

---

## 9. Long-term implications

- `bridge-core` generalizes beyond this one route: adding EVM→Solana, more EVM L2s (Base), or more
  assets is additive behind the same contract — the funding UI stays stable.
- Once `bridge-cctp` (self-relayed) exists, UpDown owns the rail end-to-end with only Circle as a
  dependency — the aggregator becomes a removable convenience, not a lock-in.
- The bridge + the HyperLiquid agent flow (ADR-003 §4) together complete the "Solana user → live
  trader" onboarding: link EVM wallet → bridge funds → approve agent → trade. Each piece is a
  bounded, independently shippable step.

---

## 10. If I were lead architect

Ship the funding flow on **CCTP** (native USDC, no wrapped risk) via a **vetted aggregator SDK** so
the user signs **once on Solana** and USDC lands in their **already-known `evmAddress`** — and put it
behind a `packages/bridge-core` contract so swapping to **CCTP-direct** later is one adapter, zero UI
change. Treat the transfer as a **durable `BridgeTransfer` lifecycle**, not a blind call, so every
cross-chain hop is resumable and honestly surfaced. Keep Phase 1 to the single route that matters
(USDC, Solana → Arbitrum); everything else is additive.

**Next step (separate from this ADR):** scaffold `packages/bridge-core` (types + `BridgeAdapter` +
registry, no provider logic yet) and spike a LI.FI Solana→Arbitrum USDC quote against the real
`evmAddress` — confirming the destination-gas/relayer story (§8.2) before committing to the SDK.

---

## 11. Spike results (2026-06-24) — LI.FI quote run (bridge deferred from MVP)

**Status: the bridge is NOT in the MVP.** A `packages/bridge-core` contract was prototyped during
this spike (types + `BridgeAdapter` + `BridgeProvider` registry) to validate the shape, then set
aside — the code was not kept. These findings are preserved here so the work can resume later without
re-running the spike. The LI.FI spike hit the public `li.quest/v1` API for a real **25 USDC,
Solana → Arbitrum** quote/routes (placeholder addresses):

**`/v1/advanced/routes` returned 6 routes** (best output first), out of 25.00 USDC in:

| Route (LI.FI tool) | Out (USDC) | ETA | Native CCTP? |
|---|---|---|---|
| `across` | 24.924 | ~2s | no (intent/liquidity) |
| `near` (NearIntents) | 24.925 | ~19s | no (intent) |
| `relaydepository` (Relay) | 24.910 | ~2s | no (intent) |
| `mayanFastMCTP` | 24.895 | ~35s | **yes — CCTP under the hood (Mayan MCTP)** |
| `mayan` | 24.877 | ~3s | no (Mayan swap) |
| `mayanMCTP` | 23.877 | ~60s | yes (CCTP) but worst output |

**Findings:**
1. **§8.2 destination gas — RESOLVED (the gating question).** Every route charges the user only
   **~$0.009 of gas on Solana (source)** and **zero gas on Arbitrum**. The destination mint/delivery
   is relayed. A user with **0 ETH** receives USDC fine. One signature, on Solana only. ✅
2. **Cheap + fast.** Best routes settle in ~2s at ~0.3% all-in (LIFI fixed fee $0.0625 + bridge fee).
3. **⚠️ Premise correction — pure Circle CCTP is NOT a LI.FI route for SOL→ARB.** Constraining to
   CCTP (`allowBridges=cctp/celercircle`) returns **400/404**. The only CCTP-*based* rail LI.FI
   exposes here is **Mayan MCTP** (`mayanFastMCTP` ~35s). LI.FI's *best* routes are intent/solver
   bridges (Across / NearIntents / Relay) — which deliver native USDC but are **not** the
   burn-and-mint, no-liquidity-pool rail §2 assumed. So "CCTP via aggregator" doesn't hold as written.

**Decision this surfaces (rail policy for Phase 1):**
- **(a) Best-route via LI.FI** (Across/Near/Relay) — best UX (2s, cheapest), but relies on
  solver/intent liquidity, not native CCTP.
- **(b) CCTP-backed via LI.FI** — constrain to `mayanFastMCTP` (Mayan MCTP, CCTP under the hood):
  keeps the native-USDC property §2 wanted, ~35s, slightly less out.
- **(c) CCTP-direct** (the original `bridge-cctp` Phase-2 target) — implement Circle CCTP +
  relayer/attestation ourselves: zero third-party, most work; defer.

`bridge-core` is agnostic to this — all three are a provider/registry choice, **zero UI change**.
Recommendation: ship Phase 1 on **(a)** for UX *or* **(b)** if the no-liquidity-pool guarantee is a
hard requirement; keep (c) as the long-term exit. Pending product call before building `bridge-lifi`.
