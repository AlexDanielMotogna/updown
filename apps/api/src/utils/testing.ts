/**
 * Testing-phase growth knobs. TESTING_MODE is ON by default while the platform
 * is in its testing campaign; set TESTING_MODE=false to disable the testing
 * rewards (e.g. at mainnet launch).
 */
export const TESTING_MODE = process.env.TESTING_MODE !== 'false';

/**
 * Bets that reached a REAL resolution (win/loss, not refund) required to count
 * as an "active / real" user. Single source of truth reused by the 20-bet
 * reward, community-milestone eligibility and referral-prize validity.
 */
export const ACTIVE_BET_THRESHOLD = 20;

/** Fixed UP reward at the 20-bet milestone (stored units; display = /100 = 1000 UP). */
export const BET_MILESTONE_REWARD = 100_000n;
export const BET_MILESTONE_TYPE = 'BET_MILESTONE_20';

/**
 * UP reward to the REFERRER each time one of their referred users becomes
 * "activated" (reaches the 20-bet threshold). Stored units → 1000 UP. Gated on
 * the referral not being flagged suspect (anti-cheat, #2). Idempotent per
 * referred wallet via RewardGrant type `REFERRAL_ACTIVATED:<referredWallet>`.
 */
export const REFERRER_REWARD = 100_000n;
export const REFERRER_REWARD_TYPE = 'REFERRAL_ACTIVATED';

/**
 * Referral-prize leaderboard — UP awarded to the top 20 referrers by VALID
 * referrals (active + not suspect) at campaign end. Index 0 = rank 1. Display
 * UP (not stored units). Placeholder amounts — tune freely.
 */
export const REFERRAL_PRIZES: number[] = [
  50000, 30000, 20000, 15000, 12000,
  10000, 9000, 8000, 7000, 6000,
  5000, 4500, 4000, 3500, 3000,
  2500, 2000, 1500, 1200, 1000,
];
/** Prize (display UP) for a 1-based rank, or 0 if outside the prize tiers. */
export function referralPrizeForRank(rank: number): number {
  return REFERRAL_PRIZES[rank - 1] ?? 0;
}
