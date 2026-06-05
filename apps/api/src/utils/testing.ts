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
