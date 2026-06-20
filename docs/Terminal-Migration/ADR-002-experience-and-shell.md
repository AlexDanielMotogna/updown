# ADR-002 — Trading Terminal: Experience, Shell & Portfolio

- **Status:** Proposed
- **Scope:** How the user *experiences* UpDown (betting) + the Trading Terminal + their money as
  one product — navigation, shell, design cohesion, session continuity, and the unified portfolio.
- **Builds on:** [ADR-001 – Terminal Architecture](./ADR-001-terminal-architecture.md). ADR-001
  decided *where the terminal lives* (`apps/terminal` in the monorepo + `packages/exchange-*`).
  This ADR decides *how it feels to the user*. **It does not change ADR-001's repo/deploy topology.**

---

## 1. Context

The terminal is not "just a terminal" — it also surfaces the user's **wallet / portfolio**
(balances, positions, PnL, deposits/withdrawals, history). The user's money spans **two worlds**:
parimutuel betting pools (Solana, via UpDown's `api`) and perps trading (HyperLiquid, via
`exchange-core`). The open question was: **should it feel like one product or two apps?**

A separate deployable (`apps/terminal` at `terminal.updown.my`, per ADR-001) can feel like *either*.
Which one it feels like is a product/UX decision, driven by the shell, navigation, design language,
session continuity, and where the portfolio lives — **not** by the repo layout.

---

## 2. Decision

**One product, two modes** — the Coinbase ↔ Coinbase Advanced / Kraken ↔ Kraken Pro pattern.

- The user perceives **one identity with three surfaces**: **Predict** (betting), **Trade**
  (terminal), **Portfolio** (money across both).
- The two trading surfaces are **optimized differently** (Predict = gamified/MUI; Trade =
  dense/pro/Tailwind) but share **one brand, one shell/top-bar, one session, and one unified
  portfolio**.
- Switching to Trade is **instant** (shared Privy session across the subdomain) so it never feels
  like logging into another app.

**Principle: consistency at the brand/shell level, divergence at the workspace level.** The terminal
*should* look "pro" and different — that is a feature. What must stay constant is the identity bar,
brand tokens, and session.

---

## 3. Mental model — three surfaces over one identity

| Surface | What it is | Lives in | Backend |
|---|---|---|---|
| **Predict** | Betting/prediction pools (today's UpDown) | `apps/web` | `api` + Solana program |
| **Trade** | Perps terminal | `apps/terminal` | HyperLiquid via `exchange-core` |
| **Portfolio** | The user's money across **both** | `apps/web` route (initially) | `/api/portfolio` aggregator |

**Portfolio is the glue.** It is the one view that proves "this is one product, my money in one
place." It aggregates both worlds (see §5).

---

## 4. The continuity layer (what makes two deploys feel like one product)

Four pieces. They are cheap and they are exactly what kills the "two separate apps" feeling.

1. **`packages/ui-tokens` — one brand source.** Colors, type, spacing, radii as framework-agnostic
   tokens (JS + CSS vars). `apps/web` consumes them in its MUI theme; `apps/terminal` consumes them
   in its `tailwind.config`. Same brand across two styling engines.
2. **Shared shell / workspace switcher — via tokens, not a forced component.** The top-bar
   (`Predict | Trade | Portfolio | (@user, wallet)`) appears the same on every surface. Do **not**
   force one app's CSS system (MUI/Tailwind) onto the other. Instead: a `packages/app-shell-config`
   holds the nav items / routes / active-state logic, and **each app renders its own header from
   the shared tokens + that config**. Visual match comes from tokens; code stays decoupled.
   (Optional later: a true shared web-component header for pixel-identical chrome.)
3. **Privy SSO across subdomains — the instant handoff.** Same Privy app id, session shared across
   `*.updown.my`. Tapping **Trade** loads `terminal.updown.my` already authenticated.
   ⚠️ **Verify early** that Privy supports cross-subdomain sessions (cookie on the parent domain);
   if not, do a token handoff on navigation. Without this it feels like a different app.
4. **Unified Portfolio — an aggregator over both worlds** (see §5).

---

## 5. Portfolio aggregator design

A BFF endpoint composes both sources into one normalized shape:

```
GET /api/portfolio  ->
{
  updown:  { usdc, poolPositions[], claimable, level, xp },   // api + Solana
  trading: { equity, positions[], openOrders[], pnl },         // exchange-core.forUser(userId).read
  totals:  { netWorth, ... },
  custody: { solana: {...}, evm: {...} }                        // see dual-custody note
}
```

- **Lives in `apps/web`** as a route initially (account-centric; web already owns profile/wallet) —
  avoids building a third app. The aggregator endpoint can live in `apps/api` or as a web BFF route.
- **Define the normalized shape early** (even before building Phase 3) so both worlds agree on the
  contract from day one.
- **Dual custody (important):** trading equity sits on an **EVM/HyperLiquid** account; betting funds
  sit on **Solana**. The Portfolio must present **two custody contexts clearly** — not blended as if
  it were one wallet. This is the user-facing consequence of ADR-001's top risk (multi-chain
  signing) and reinforces solving Privy EVM+Solana wallets in the terminal's first phase.

---

## 6. Navigation / handoff model

- The same top-bar on **every** surface → it reads as tabs of one app.
- `Predict` and `Portfolio` → `apps/web`; `Trade` → `terminal.updown.my`. Identical bar = one
  identity.
- Phase-4 polish: deep-link to last-viewed market, unified deposit/withdraw, cross-surface
  notifications.

---

## 7. Phased roadmap & checklist

> Track this like [doc 20](./20-migration-checklist-gaps.md). **Rule: Phase 1 before 2 and 3** —
> build the unification *on top of* a working terminal, not before it exists.

### Phase 0 — Exchange contract
- [ ] Scaffold `packages/exchange-core` (interfaces `ExchangeReadAdapter` / `ExchangeSigner` /
      `ExchangeStream`, `registry`, `CachedExchangeAdapter`) — see ADR-001 §5. No exchange logic.

### Phase 1 — Terminal that trades (standalone)
- [ ] Scaffold `apps/terminal` (Next 14 + Tailwind, from migration docs 02–04, 10).
- [ ] Wire Privy auth/wallet in the terminal (**including an EVM embedded wallet for HyperLiquid**).
- [ ] `packages/exchange-hyperliquid`: read + stream + EIP-712 signer (verify vs HL testnet).
- [ ] Port panels/hooks from TFC (docs 05–14), stripping the fight/referral layer (doc 20).
- [ ] Read/proxy API routes (doc 17) → `ExchangeProvider.read()`.
- [ ] Deploy to `terminal.updown.my`. Nav back to UpDown can be a plain link for now.
- [ ] **DoD:** a user can connect, see markets/orderbook/chart, and place/cancel a HyperLiquid order.

### Phase 2 — Make it feel like one product
- [ ] `packages/ui-tokens` (brand tokens) — adopted by both `web` (MUI theme) and `terminal`
      (Tailwind config).
- [ ] `packages/app-shell-config` + each app renders the shared top-bar (`Predict | Trade |
      Portfolio`) from tokens.
- [ ] **Privy SSO across `*.updown.my`** (or token handoff) — verify no re-login on Trade.
- [ ] **DoD:** clicking Trade from UpDown lands in the terminal, already logged in, with the same
      identity bar and brand.

### Phase 3 — Unified Portfolio (the money, in one place)
- [ ] Define the normalized `/api/portfolio` contract (do this in Phase 1 if possible).
- [ ] Implement the aggregator (UpDown via api/Solana + trading via `exchange-core.forUser`).
- [ ] Portfolio surface as a route in `apps/web`, showing both worlds + dual custody clearly.
- [ ] **DoD:** one screen shows betting balances/positions + trading equity/positions/PnL + net worth.

### Phase 4 — Cohesion polish
- [ ] Deep-link to last market; remember per-user terminal state.
- [ ] Unified deposit/withdraw entry points.
- [ ] Cross-surface notifications.
- [ ] `packages/exchange-pacifica` as the **second** adapter — proves the abstraction generalizes.
- [ ] `ExchangeConnection` (per-user exchange selection) once 2+ exchanges ship.

---

## 8. Risks & decisions specific to this model

1. **Privy cross-subdomain session** — make-or-break for the "feels like one" goal; verify in
   Phase 1/2.
2. **Tokens, not components, for the shell** — sharing brand via tokens avoids forcing MUI↔Tailwind.
3. **Define the Portfolio contract early** — both worlds must agree on the normalized shape before
   Phase 3.
4. **Dual custody (EVM + Solana)** — the Portfolio must show two custody contexts; this is the
   user-facing face of ADR-001's multi-chain-signing risk. Solve Privy EVM+Solana wallets in
   Phase 1.

---

## 9. Consequences

- The terminal can look and perform like a pro trading app while remaining unmistakably part of
  UpDown; the user has one login, one identity, and one portfolio.
- The continuity layer is additive and deploy-agnostic — it works precisely because ADR-001 keeps
  the apps as separate deployables sharing a monorepo.
- Cost: a few small shared packages (`ui-tokens`, `app-shell-config`), the Privy SSO setup, and the
  portfolio aggregator. None are on the critical path to *shipping trading* (Phase 1), so trading
  can launch before full unification.
