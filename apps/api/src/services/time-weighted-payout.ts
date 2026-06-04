/**
 * Time-weighted parimutuel payout math.
 *
 * The plain-parimutuel formula UpDown ships today gives every winner a
 * share proportional to their stake regardless of WHEN they bet. So a
 * user who waits until the last 10 seconds of a 5-minute pool, sees the
 * price action play out, and snipes the obvious side gets the same
 * proportional reward as someone who took a real risk at t=0.
 *
 * Time-weighting fixes this. Each bet earns a `weight = amount × M(t)`
 * where M(t) is a multiplier that decays with how late in the window
 * the bet was placed. Payouts are then computed by weight share, not
 * stake share, so early bettors keep most of the upside on the losing
 * pool while late bettors still earn their stake back plus a small
 * positive bonus.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Formula
 * ──────────────────────────────────────────────────────────────────────
 *
 *   window         = lockTime − startTime
 *   timeInPool     = lockTime − betTime           (≥ 0, capped at window)
 *   rawRatio       = timeInPool / window          (1.0 at start, 0 at lock)
 *   M(t)           = max(WEIGHT_FLOOR, rawRatio ^ DECAY_EXPONENT)
 *   weight_i       = amount_i × M(t_i)
 *
 *   For each winner i:
 *     winnings_i   = (weight_i / Σ weight_winners) × Σ stake_losers
 *     payout_i     = amount_i + winnings_i        ← principal + share of losing pool
 *
 * Conservation: Σ payout_winners  =  Σ stake_winners + Σ stake_losers
 *                                  =  total_pool                       ✓
 *
 * ──────────────────────────────────────────────────────────────────────
 * Tunables
 * ──────────────────────────────────────────────────────────────────────
 *
 *   WEIGHT_FLOOR     0.10 — even a t-1s bet gets 10 % weight, so a winner
 *                            who picked the right side at the buzzer
 *                            still pockets a tiny positive bonus on top
 *                            of their stake. Avoids the "win the bet but
 *                            lose money" outcome that would scare users
 *                            off the platform entirely.
 *
 *   DECAY_EXPONENT   1.5  — gentle concave decay. Linear (k=1) felt too
 *                            soft against snipers in our paper-trade
 *                            tests; quadratic (k=2) was too punitive on
 *                            mid-window bets. 1.5 keeps the front half
 *                            of the window competitive (M(0.50) ≈ 0.35)
 *                            while collapsing the last 20 % aggressively.
 *
 * Both knobs are env-overridable so the operator can A/B without a
 * redeploy. Keep them in [0, 1] for the floor and [0.5, 3] for the
 * exponent — outside that range the math still works but the UX is
 * weird.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Phase status (2026-06-04)
 * ──────────────────────────────────────────────────────────────────────
 *
 * Phase 1A (THIS COMMIT) — math + advisory display:
 *   • The helpers below are wired into the pool detail endpoint so the
 *     UI can show users the live multiplier and a projected payout.
 *   • Actual on-chain payouts are STILL plain parimutuel — the existing
 *     claim instruction in the Anchor program is untouched.
 *   • Phase 1B will reroute auto-claim through a treasury-funded
 *     authority that transfers the weighted amounts directly to users,
 *     bypassing the on-chain claim. That's the next commit.
 *   • Phase 2 (later) puts the weight on-chain so the contract enforces
 *     it without trusting the authority.
 */

const WEIGHT_FLOOR = (() => {
  const n = Number(process.env.TIME_WEIGHTED_FLOOR);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.1;
})();

const DECAY_EXPONENT = (() => {
  const n = Number(process.env.TIME_WEIGHTED_EXPONENT);
  return Number.isFinite(n) && n >= 0.5 && n <= 3 ? n : 1.5;
})();

/** Inputs the math needs from a pool row. Keeps the helper portable
 *  (no Prisma type dep) so it can be reused in unit tests / scripts. */
export interface PoolTimeWindow {
  startTime: Date;
  lockTime: Date;
}

/** Inputs from a single bet. `createdAt` is what the math actually
 *  uses — `amount` is BigInt (micro-USDC) carried through unchanged. */
export interface BetSnapshot {
  amount: bigint;
  side: 'UP' | 'DOWN' | 'DRAW';
  createdAt: Date;
}

/**
 * Multiplier M(t) for a bet placed at `betTime` against a pool whose
 * eligible window is `pool.startTime → pool.lockTime`.
 *
 * Returns a value in [WEIGHT_FLOOR, 1.0]. Out-of-window timestamps are
 * clamped — earlier than startTime returns 1.0, later than lockTime
 * returns WEIGHT_FLOOR. Defensive: a pool with lockTime <= startTime
 * (shouldn't happen, but corrupted seed data) returns 1.0 for every bet
 * so we degrade to plain parimutuel rather than NaN.
 */
export function computeMultiplier(pool: PoolTimeWindow, betTime: Date): number {
  const start = pool.startTime.getTime();
  const lock = pool.lockTime.getTime();
  const window = lock - start;
  if (window <= 0) return 1.0;
  const t = Math.max(start, Math.min(lock, betTime.getTime()));
  const rawRatio = (lock - t) / window;
  const decayed = Math.pow(rawRatio, DECAY_EXPONENT);
  return Math.max(WEIGHT_FLOOR, decayed);
}

/**
 * Current multiplier for a bet placed RIGHT NOW. Used by the bet form
 * UI to surface the live decay before the user commits. Default `now`
 * is Date.now() — override in unit tests.
 */
export function currentMultiplier(pool: PoolTimeWindow, now: Date = new Date()): number {
  return computeMultiplier(pool, now);
}

/**
 * Convenience: bet's weight in raw micro-USDC (same units as amount).
 * Uses 1e9 precision internally so the float multiplier doesn't lose
 * tail bits of the BigInt amount on huge bets.
 */
const PRECISION = 1_000_000_000n;
export function computeWeight(pool: PoolTimeWindow, bet: BetSnapshot): bigint {
  const m = computeMultiplier(pool, bet.createdAt);
  const mScaled = BigInt(Math.round(m * 1_000_000_000));
  return (bet.amount * mScaled) / PRECISION;
}

/**
 * Total weighted payout for one winner, given the resolved pool totals.
 * Returns { weight, share, winnings, payout } — the components are kept
 * separate so the caller can log a breakdown and the UI can display
 * "you got $X stake back plus $Y winnings".
 *
 *   winningStakeTotal — Σ raw amounts on the winning side (the principal
 *                       that gets returned to winners)
 *   losingStakeTotal  — Σ raw amounts on the losing side (the pool that
 *                       gets redistributed by weight)
 *   winningWeightSum  — Σ weight_i for all winners on the winning side
 *
 *  The caller computes those three sums once across the bet list and
 *  then calls computeWinnerPayout for each bet — O(n) total.
 */
export function computeWinnerPayout(args: {
  bet: BetSnapshot;
  pool: PoolTimeWindow;
  losingStakeTotal: bigint;
  winningWeightSum: bigint;
}): { weight: bigint; winnings: bigint; payout: bigint } {
  const { bet, pool, losingStakeTotal, winningWeightSum } = args;
  const weight = computeWeight(pool, bet);
  if (winningWeightSum === 0n) {
    // Edge case: no winners (e.g. nobody bet on the side that won).
    // Caller's responsibility to handle, but return a safe shape.
    return { weight: 0n, winnings: 0n, payout: bet.amount };
  }
  const winnings = (weight * losingStakeTotal) / winningWeightSum;
  return { weight, winnings, payout: bet.amount + winnings };
}

/**
 * Operator-facing diagnostic. Returns the current tunables so the
 * /api/admin/system endpoint can surface them and so the bet-form UI
 * can show "Floor 10 %, decay exponent 1.5" in the info tooltip.
 */
export function getTimeWeightedConfig(): { floor: number; exponent: number } {
  return { floor: WEIGHT_FLOOR, exponent: DECAY_EXPONENT };
}
