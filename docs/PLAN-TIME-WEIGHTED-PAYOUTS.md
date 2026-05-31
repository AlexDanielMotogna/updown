# Plan — Time-weighted payouts (crypto pools)

Status: **draft / not implemented**
Scope: crypto pools only (sports & Polymarket out of scope — discrete events, no
comparable info-leak during the betting window)
Author target: 1 dev, ~2 weeks end-to-end including on-chain redeploy.

---

## 1. Problem

Current parimutuel payout, in `apps/api/src/utils/payout.ts` and mirrored in the
Anchor program:

```
share_i = stake_i / Σ(stake_winners) × (totalPool − fee)
```

**Time of entry is ignored.** A user who deposits 60 s before lock has seen
~59 min of price movement and takes near-zero directional risk; a user who
deposited at `startTime` carried the full uncertainty. Both receive the same
$/$. Two consequences:

1. **Unfair** — same reward for radically different risk.
2. **Sniping vector** — rational late entrants pile onto whichever side is
   already winning, dilute the early winners' payout, and free-ride on revealed
   information.

The Anchor `BetEscrow` accounting is symmetric in stake; nothing on-chain
inhibits this today.

## 2. Goal

Reward time-at-risk while keeping the parimutuel invariants (winners share the
losing pool minus fee; the house never adds liquidity).

## 3. Proposed mechanism — weighted parimutuel

Each deposit is assigned a **weight** based on how much of the betting window
remains at the moment of the on-chain instruction:

```
weight_i = stake_i × (lockTime − now) / (lockTime − startTime)
```

Bounded in `[0, stake_i]`. Payouts use weighted totals instead of raw stake:

```
share_i = weight_i / Σ(weight_winners) × (totalPool − fee)
```

| t deposited | weight multiplier |
|---|---|
| startTime | 1.00× |
| 25% in | 0.75× |
| 50% in | 0.50× |
| 75% in | 0.25× |
| lockTime | 0.00× |

### 3.1 Variants considered

- **A. Linear** ⭐ — the formula above. Intuitive, monotonic, easy to display.
- **B. Convex** — `weight = stake × ((lockTime − now)/(lockTime − startTime))^α`,
  `α = 2`. Harsher decay; more opaque to users.
- **C. Discrete tiers** (1.00× / 0.85× / 0.65× / 0.50× by quartile). Easier to
  market but introduces **cliff effects** — users rush in just before each tier
  boundary, which is itself a UX failure mode.
- **D. Linear with floor** — `max(0.30, (lockTime − now)/(lockTime − startTime))`.
  Conserves late liquidity by guaranteeing ≥30% credit. Recommended **fallback**
  if shadow-mode data (§7) shows option A kills late entries.

**Decision: ship A. Switch to D only if shadow data shows late-window bet
volume collapsing > X%.** Threshold to be defined during phase 1 of rollout.

## 4. Implementation

### 4.1 On-chain (Anchor) — the heavy piece

Files: `programs/updown/src/state.rs`, `programs/updown/src/instructions/deposit_bet.rs`,
`programs/updown/src/instructions/claim.rs`.

- **`UserBet` PDA**: add `weighted_amount: u64`.
- **`BetEscrow`**: add `total_weighted_up: u64`, `total_weighted_down: u64`,
  `total_weighted_draw: u64`.
- **`deposit_bet`**: read the Solana `Clock` sysvar (not a client-supplied
  timestamp — the client cannot be trusted) and compute:
  ```rust
  let now = Clock::get()?.unix_timestamp as u64;
  let total = pool.lock_time.saturating_sub(pool.start_time);
  let remaining = pool.lock_time.saturating_sub(now);
  let weighted = (amount as u128 * remaining as u128 / total.max(1) as u128) as u64;
  ```
  Persist `weighted` in `UserBet`; add to the matching `total_weighted_*`.
- **`claim`**: divide by weighted totals, not raw totals:
  ```
  payout = user.weighted_amount × net_pool / total_weighted_winner_side
  ```
- **Rounding & dust**: keep the current rounding-down convention so the escrow
  cannot under-fund a payout. Any residual dust stays in escrow exactly as today.
- **Account layout change → redeploy.** New program ID, new IDL.

### 4.2 DB (Prisma)

`apps/api/prisma/schema.prisma`:

- `Bet`: `weightedAmount BigInt @map("weighted_amount")`.
- `Pool`: `totalWeightedUp/Down/Draw BigInt @default(0) @map("total_weighted_*")`.

Migration: backfill `weightedAmount = amount` and `totalWeighted* = total*`
for existing rows (retroactive weight = 1.0). Equivalent to "old pools run on
the old formula", which they do.

Keep the raw `totalUp/Down/Draw` columns — used by every existing display and
by serializers — and just add the weighted columns alongside.

### 4.3 Backend (`apps/api`)

- `routes/bets.ts` `createBet`: compute the expected weight server-side for the
  preview/quote returned to the UI, but **persist whatever the on-chain
  instruction wrote** (read it back from the `UserBet` PDA after confirmation).
  Source of truth is on-chain.
- `utils/payout.ts` `calculatePayout`: accept `weightedTotal{Up,Down,Draw}` and
  `userWeightedAmount`; existing call sites refactored to pass them.
- `utils/serializers.ts` `serializeBet` / `serializePool`: expose
  `weightedAmount`, `currentEntryWeight` ("if you bet right now your stake
  counts as X×"), and a `potentialPayout` that already uses weights.
- `scheduler` resolution (`apps/api/src/scheduler/*`): pool finalisation reads
  `total_weighted_*` and writes `winner`. The autoclaim worker (PR #62, see
  [[project-auto-payout-branch]]) consumes weighted totals via `calculatePayout`
  — no separate code path.

### 4.4 Frontend (`apps/web`)

- `CryptoPoolCard` and `app/pool/[id]/page.tsx`: live **"current entry weight:
  0.74×"** indicator + a decay bar that re-renders each second on the client.
  Pure visual — the source of truth still lives on-chain.
- Bet form: tooltip + a tiny simulator: *"At 0.74× your $5 deposit counts as
  $3.70 in the payout calculation. Earlier bettors get a bigger slice."*
- `Predictions` right sidebar and `Profile`: show each bet's stored
  `weightedAmount` and "effective rate" (`weightedAmount / amount`). Makes the
  weighting visible after the fact.
- Educational tooltip language: *"Early bird gets a bigger slice. The longer
  your stake is at risk, the larger your share of the pool."*

### 4.5 Tests

- `apps/api/__tests__/payout.test.ts`: golden case — two winners, $5 each, one
  at `t=0` and one at `t = 0.95 × duration`. Verify the early bettor receives
  ~20× the per-dollar share of the late one. Verify total payout still equals
  `netPool` (no dust escapes silently).
- Property test: for any ordering of N bets across the window, the sum of
  payouts equals `netPool` modulo rounding-down dust ≤ N lamports.
- E2E via the existing scaffolding: deposit at distinct timestamps, force-resolve,
  claim, assert balances.

## 5. Anti-gaming

The big one — *cancel-and-rebet to lock in early weight without risk* —
**is not a vector**: the app does not expose any cancel/exit-pool flow, and
neither does the Anchor program. Confirmed in the code (`deposit_bet` is the
only deposit-side instruction; there is no `cancel_bet` / `withdraw`).

Remaining surface, mitigated:

| Vector | Mitigation |
|---|---|
| **Dust early-stake** — tiny stake very early to claim max weight | Existing min-stake floor; weight is *proportional* to stake so a 1¢ stake gets a proportionally tiny weight |
| **Last-second sniping** | Eliminates itself — weight ≈ 0 |
| **Client-supplied timestamp manipulation** | Anchor reads `Clock` sysvar; client cannot lie |
| **Server / chain time drift** | Use `Clock` on-chain everywhere it matters; server `Date.now()` is preview-only and explicitly labelled "estimated" in serializer output |

## 6. Risks and trade-offs

- **Late liquidity drops.** If users learn that betting in the last 10% of the
  window pays at most 10% of nominal, they may stop betting then. Pool sizes
  shrink; everyone earns less. Mitigated by variant D's floor if it materialises.
- **UX complexity.** A second axis (time) on top of stake. Belted with a
  tooltip + a payout simulator on the bet form. Without those, churn risk.
- **On-chain redeploy.** Three environments share one authority wallet
  (localhost / Railway dev / Railway prod). A new program ID needs coordinated
  client updates and a clean cutover. Existing in-flight pools should either
  drain under the old program or be wiped via `apps/api/scripts/empty-pools.ts`
  (already in the repo, localhost-guarded).
- **Solo applies to crypto.** Sports/PM events resolve on a fixed external
  timestamp; intermediate price/state can leak but the betting market does not
  have the same "watch the underlying for 59 min and snipe" structure.

## 7. Rollout in phases

1. **Pick formula (A vs D).** Replay historical bets through both formulas
   offline; pick the one that doesn't collapse late-window volume by more
   than a tolerance to be defined.
2. **Backend shadow mode.** Behind feature-flag `WEIGHTED_PAYOUT_ENABLED`,
   compute and persist `weightedAmount` and `totalWeighted*` on every bet
   *without* using them in payout math. Compare alongside real payouts.
3. **UI shadow.** Show the entry weight on cards / bet form so users see it
   coming. Still no economic effect.
4. **Anchor v2 on localhost.** Redeploy, wipe local pools via `empty-pools.ts`,
   dogfood with the team.
5. **Devnet.** Repeat with the Railway dev environment.
6. **Mainnet ramp.** Single asset (e.g. BTC 1h). Track:
   - total bets per pool,
   - bet count distribution across quartiles of the window,
   - churn / DAU,
   - average effective weight at deposit.
   If healthy after a defined observation period, expand to all crypto pairs.

## 8. Effort estimate

| Block | Days |
|---|---|
| Anchor instructions + program tests | 3-5 |
| DB migration + backend wiring | 2 |
| Frontend: indicator, simulator, tooltips | 2 |
| Redeploy plan + comms + dashboards | 1-2 |
| **Total** | **~2 weeks (1 dev)** |

## 9. Open questions

- Threshold for "late liquidity collapsed" before falling back to variant D.
- Whether to expose the formula in-app docs or keep it as a tooltip only.
- Does the autoclaim worker need any new metric on top of `weightedAmount`
  to reason about pool health?
- Should the bet form preview the user's expected payout at *current* odds
  *and* at-resolution odds (which depend on future bets)?
