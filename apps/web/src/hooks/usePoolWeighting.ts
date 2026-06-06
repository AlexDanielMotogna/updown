'use client';

import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/constants';

/**
 * Live time-weighting snapshot for a pool. Backs the bet-form badges
 * that show "x0.87 weight right now" and the projected weighted payout
 * for a fresh bet.
 *
 * Polls every POLL_MS - fast enough that the multiplier countdown
 * doesn't visibly stutter, slow enough that we're not hammering the
 * API. Pauses once the pool is no longer JOINING (the form is gone by
 * then anyway).
 *
 * Phase 1A - advisory only. On-chain payouts still use plain
 * parimutuel until the Phase 1B auto-claim rerouting lands.
 */
export interface PoolWeighting {
  poolId: string;
  status: string;
  /** Multiplier you would get RIGHT NOW. Floats in [0.1, 1.0]. */
  currentMultiplier: number;
  config: { floor: number; exponent: number };
  /** Full window length in ms - lockTime − startTime. */
  windowMs: number;
  /** Countdown to lock in ms (0 when locked). */
  msUntilLock: number;
  /** Raw stakes per side (BigInt strings, USDC micro-units). */
  stakes: { up: string; down: string; draw: string };
  /** Time-weighted sums per side (same units). Used to project a
   *  winner's bonus given the current side mix. */
  weighted: { up: string; down: string; draw: string };
}

const POLL_MS = 3000;

export function usePoolWeighting(poolId: string | undefined, enabled = true) {
  return useQuery<PoolWeighting | null>({
    queryKey: ['pool-weighting', poolId],
    queryFn: async () => {
      if (!poolId) return null;
      const res = await fetch(`${API_BASE_URL}/api/pools/${poolId}/weighting`);
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data ?? null;
    },
    enabled: !!poolId && enabled,
    refetchInterval: (q) => {
      // Stop polling once we know the pool isn't JOINING anymore - the
      // bet form will have unmounted by then. queryFn returns null when
      // the request errors, so guard for that too.
      const data = q.state.data as PoolWeighting | null | undefined;
      if (!data) return POLL_MS;
      return data.status === 'JOINING' ? POLL_MS : false;
    },
  });
}

/**
 * Project a winner's payout given a prospective bet under the
 * time-weighted formula. Used by the bet form to surface "if you win,
 * you'll get $X" alongside the existing plain-parimutuel estimate so
 * the user sees both worlds during Phase 1A.
 *
 *   weighting   - latest /weighting snapshot from the hook
 *   amount      - micro-USDC the user is about to bet
 *   side        - UP / DOWN (DRAW supported for 3-way pools)
 *   feePercent  - taken off the gross payout (matches current code)
 */
export function projectWeightedPayout(args: {
  weighting: PoolWeighting;
  amount: bigint;
  side: 'UP' | 'DOWN' | 'DRAW';
  feePercent: number;
}): { payout: number; odds: number } | null {
  const { weighting, amount, side, feePercent } = args;
  if (amount <= 0n) return { payout: 0, odds: 0 };

  // The user's bet hasn't landed yet, so we add its weight to the
  // current snapshot to project the payout AS IF they bet right now.
  const m = weighting.currentMultiplier;
  const myWeight = BigInt(Math.round(Number(amount) * m));

  const winningSide = side;
  // Losing side total = sum of raw stakes on every side that isn't the
  // candidate winner. The user's own amount only joins the winning side
  // - it doesn't count as losing-side stake.
  const stakeUp = BigInt(weighting.stakes.up);
  const stakeDown = BigInt(weighting.stakes.down);
  const stakeDraw = BigInt(weighting.stakes.draw);
  const losingStake = winningSide === 'UP'
    ? stakeDown + stakeDraw
    : winningSide === 'DOWN'
      ? stakeUp + stakeDraw
      : stakeUp + stakeDown;

  // Winning weight pool already includes the user's projected weight.
  const weightUp = BigInt(weighting.weighted.up) + (side === 'UP' ? myWeight : 0n);
  const weightDown = BigInt(weighting.weighted.down) + (side === 'DOWN' ? myWeight : 0n);
  const weightDraw = BigInt(weighting.weighted.draw) + (side === 'DRAW' ? myWeight : 0n);
  const winningWeight = winningSide === 'UP' ? weightUp : winningSide === 'DOWN' ? weightDown : weightDraw;
  if (winningWeight === 0n) return null;

  // winnings = (myWeight / winningWeight) × losingStake
  // grossPayout = principal + winnings
  const winnings = Number(myWeight) * Number(losingStake) / Number(winningWeight);
  const grossPayout = Number(amount) + winnings;
  const netPayout = grossPayout * (1 - feePercent);
  const USDC_DIVISOR = 1_000_000;
  const payoutUsd = netPayout / USDC_DIVISOR;
  const amountUsd = Number(amount) / USDC_DIVISOR;
  return {
    payout: payoutUsd,
    odds: amountUsd > 0 ? payoutUsd / amountUsd : 0,
  };
}
