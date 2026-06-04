# Time-weighted parimutuel payouts

**Branch**: `feature/time-weighted-payouts`
**Status (2026-06-04)**: code complete (off-chain Phase 1A + on-chain Phase 2). NOT deployed.

## Problem

Plain parimutuel pays winners proportional to stake alone. A user who waits
until the last 10s of a 5-minute pool, watches the price action, and snipes
the obvious side gets the same proportional share as someone who took a real
risk at t=0. Late-entry sniping is rampant and there's nothing in the maths
that disincentivises it.

## Solution

Each deposit earns a **weight** based on how early in the window it lands.
Payouts then split the LOSING pool by weight share, not stake share, while
every winner still gets their full principal back. Math derivation:

```
window           = lock_time - start_time
remaining(t)     = lock_time - t                              ∈ [0, window]
multiplier(t)    = max(WEIGHT_FLOOR_BPS / 10_000,
                       remaining(t) / window)                 ∈ [floor, 1.0]
weight_i         = amount_i × multiplier(t_i)                 (per deposit)

For each winner i on the winning side:
  losing_stake   = Σ stake_losers
  winning_weight = Σ weight_winners
  winnings_i     = (weight_i / winning_weight) × losing_stake
  payout_i       = amount_i + winnings_i                      (principal + bonus)

Conservation:
  Σ payout_winners
  = Σ amount_winners + (Σ weight_winners / Σ weight_winners) × Σ stake_losers
  = total_winning_stake + total_losing_stake
  = total_pool                                                ✓
```

### Tunables

| Constant | Value | Where | Notes |
|----------|-------|-------|-------|
| `WEIGHT_FLOOR_BPS` | `1_000` (= 0.10) | on-chain `state.rs` | Min weight per deposit. A last-second snipe still earns 10% credit. Floor low enough to disincentivise sniping, high enough to avoid "win the bet, lose money" outcomes. |
| `DECAY_EXPONENT` | `1.5` (advisory) | off-chain `time-weighted-payout.ts` | Used only in the Phase 1A advisory projection. On-chain uses linear decay (k=1) for BPF-friendly integer math; the floor does most of the heavy lifting either way. |

Both are tunable. `WEIGHT_FLOOR_BPS` requires a program redeploy; the
off-chain advisory exponent / floor live behind env vars
(`TIME_WEIGHTED_FLOOR`, `TIME_WEIGHTED_EXPONENT`) so the operator can A/B
without a deploy.

## Phase breakdown

### Phase 1A - Advisory display (DONE, code in this branch)

Goal: ship the math + UI today, validate user comprehension, gather data
on whether visible decay alone changes behaviour. Payouts still raw.

- `services/time-weighted-payout.ts` - pure math, easy to unit test.
- `GET /api/pools/:id/weighting` - live snapshot consumed by the bet form.
- `usePoolWeighting()` hook + `projectWeightedPayout()` helper.
- `PlaceBetCard` shows the live multiplier badge and a "Weighted projection"
  row alongside the existing payout estimate, tooltipped as advisory.

### Phase 1B - Skipped

Treasury-routed off-chain payouts would have taken ~3 days of plumbing
just to be thrown away when Phase 2 lands. The operator chose to skip
straight to Phase 2.

### Phase 2 - On-chain enforcement (CODE DONE, NOT DEPLOYED)

Anchor program changes:

| File | Change |
|------|--------|
| `state.rs Pool` | + `weighted_up: u64`, `weighted_down: u64`, `weighted_draw: u64`. New helper `multiplier_bps(now)`. New const `WEIGHT_FLOOR_BPS = 1_000`. |
| `state.rs UserBet` | + `weight: u64`, `entry_time: i64`. |
| `instructions/deposit.rs` | Compute multiplier from `clock.unix_timestamp` and `pool.{start_time, lock_time}`. Update both raw and weighted totals atomically. Initialise / accumulate `user_bet.weight`. Emit weight + multiplier_bps in `Deposited`. |
| `instructions/claim.rs` | Replace formula with `payout = amount + (weight × losing_stake / weighted_winning_side)`. |
| `instructions/refund.rs` | Same formula as claim (consistency). Collapses to plain stake-return in the single-bettor / no-losers cases. |
| `events.rs Deposited` | + `weight: u64`, `multiplier_bps: u64`. |

TypeScript client:

- `packages/solana-client/src/types.ts` - `PoolAccount` gains
  `weightedUp/Down/Draw`, `UserBetAccount` gains `weight`, `entryTime`.
- IDL regen required after build (`anchor build` from WSL).

API:

- `prisma/schema.prisma Bet` - + `weight BigInt?`, `entry_multiplier_bps Int?`.
- Migration `20260604010000_bet_time_weight`.
- `routes/deposits.ts` confirm route mirrors the on-chain weight math and
  writes both columns. Authoritative source is still the chain - these
  columns drive analytics + the admin dashboard.

Frontend (Phase 1A already consumes the new fields once the chain emits
them - the `usePoolWeighting` endpoint reads from the DB, which now stores
the on-chain values).

## Deployment plan

The program's `INIT_SPACE` changes - existing pools allocated with the OLD
struct cannot be deserialised by the new program. We need a clean cutover.
Options ranked by safety:

### Option A - Same program_id, full drain cutover (RECOMMENDED)

1. Stop new pool creation (set `SCHEDULER_ENABLED=false` on Railway).
2. Wait for every existing JOINING / ACTIVE pool to resolve naturally.
   Crypto pools complete in ≤ 1 hour; sports pools up to ~3 hours.
3. Once all pools are CLAIMABLE / closed, deploy the new program (same
   upgrade-authority signs).
4. Apply Prisma migration `20260604010000_bet_time_weight` against dev +
   prod.
5. Regenerate `solana-client` IDL, restart API.
6. Re-enable scheduler.

Pros: simple, no parallel-program complexity, all bets after cutover use
the new logic.

Cons: ~1-3h maintenance window where new pools aren't created.

### Option B - Different program_id, parallel programs

Run old + new programs side-by-side. Backend tags each pool with its
program version. After 24h, retire the old one.

Pros: no maintenance window.

Cons: 2x the surface area for ~1 day, every deposit / claim path needs a
program selector. Not worth the complexity given Option A's window is short.

### Cutover checklist (Option A)

- [ ] Local devnet test: full deposit -> claim cycle on a 5m pool, verify
      DB.bet.weight + chain UserBet.weight match.
- [ ] Devnet dry-run: deploy new program, run a real bet through.
- [ ] Schedule a maintenance window on Railway (idle period, e.g. EU/US
      crossover ~03:00 UTC).
- [ ] `SCHEDULER_ENABLED=false`, redeploy API.
- [ ] Wait for `prisma.pool.findFirst({ status: { in: ['JOINING','ACTIVE'] } })`
      to return null.
- [ ] `anchor upgrade` from WSL using the production keypair.
- [ ] `DATABASE_URL=<prod-url> npx prisma migrate deploy`.
- [ ] `pnpm --filter solana-client build` (regenerates IDL bindings).
- [ ] `SCHEDULER_ENABLED=true`, redeploy API.
- [ ] Place a test bet, claim it, verify the weighted payout matches the
      expected math.

## What's still on-chain authoritative

Even after Phase 2, the chain is the source of truth for:

- `Pool.weighted_*` totals (deposit-time accumulation).
- `UserBet.weight` (claim-time payout denominator numerator).
- `Pool.start_time` / `lock_time` (multiplier inputs).

The DB mirror is for analytics + admin UX only.
