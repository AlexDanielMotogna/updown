# Plan: Unify the HyperLiquid account (Unified Account)

## Goal
Make spot and perps feel like **one account** so users don't have to transfer USDC
between Spot and Perps. Decision (locked): keep everyone on **Unified Account**
(HL's recommended mode). Do **not** expose Portfolio Margin / Manual in the UI.

## What HL's "Account Type" actually is
HL has 4 account abstraction modes (`info` `userAbstraction` → string):
- **unifiedAccount** (recommended): one balance per asset, shared across spot +
  perps. USDC is the single source for spot (USDC quote) and perps (USDC
  settlement). → no Spot↔Perps transfer needed.
- **portfolioMargin**: HYPE/BTC/USDC/USDT as cross collateral, earns/pays interest.
  Beta, eligibility (acct >$10k or >$5M vol, <$5M, no open positions/orders to
  enable), cross spot+perps liquidation. Too risky/ineligible for most → not exposed.
- **default / dexAbstraction**: the legacy split (spot vs perps separate). Deprecated.
- **manual / standard**: separate per-DEX balances. For MMs/bots. Builder-fee
  RECEIVING addresses must be standard (separate concern from users).

Docs: trading/account-abstraction-modes, trading/portfolio-margin.

## Key API (SDK @nktkas/hyperliquid 0.32.2)
- `info userAbstraction { user }` → current mode. (InfoClient.userAbstraction)
- `exchange agentSetAbstraction { abstraction: "i"|"u"|"p" }` — **agent-signed**
  (server-side, no popup). `"u"` = unifiedAccount. (HyperliquidSigner.setAbstraction)
- `userSetAbstraction` — user-signed variant (not used; we have the agent).
- CoreWriter action id 16 = "Set abstraction" (HyperEVM path, not used).

## Important consequence (the real work)
Under unified/PM, **balances + holds live in the spot clearinghouse state**;
the per-perp-dex user state is "not meaningful". So flipping the mode requires
refactoring how the terminal READS the account:
- AccountInfo "Available to Trade", account equity, the spot ticket's USDC.
- Positions still come from the perp clearinghouse; balance/margin summary is unified.
- The Spot↔Perps **Transfer** button becomes unnecessary → hide it. Deposit/Withdraw stay.

Other notes: unified & PM are capped at 50k user actions/day (fine for retail).

## Status / phases
- [x] **Fase 0 (capability)** — `InfoClient.userAbstraction`, `HyperliquidSigner.
  getAbstraction/setAbstraction/ensureUnified` (idempotent: read, set `"u"` only if
  needed; leaves portfolioMargin alone). Wired into `/agent/confirm`, **gated by
  `HL_FORCE_UNIFIED=on` (default OFF)** so we don't break reads before the refactor.
- [ ] **Spike** — set `HL_FORCE_UNIFIED=on` locally, enable trading on a test
  account (mainnet), confirm `userAbstraction` flips to `unifiedAccount`, and observe
  how spot/perps balances then read (clearinghouseState vs spotClearinghouseState).
- [ ] **Fase 1** — refactor balance reads to the spot clearinghouse under unified;
  hide the Transfer button; unify "Available". Then enable `HL_FORCE_UNIFIED` by
  default / for all and backfill existing connections.
- [ ] (optional, later) Pro-only Account Type selector exposing PM/Manual with
  warnings + eligibility checks.

## Spike test procedure
1. `HL_FORCE_UNIFIED=on` in `apps/api/.env`, restart API.
2. Terminal → Enable Trading on the test account (mainnet).
3. API log shows `abstraction for 0x…: <mode> (set to unifiedAccount)`.
4. Verify `curl info userAbstraction` returns `unifiedAccount`.
5. Inspect spot ticket "Available", AccountInfo, perps "Available to Trade" — note
   what breaks → drives Fase 1.
