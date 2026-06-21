import { getLevelMultiplier } from './levels';

/**
 * UP Coins calculation utilities.
 *
 * Rate: 0.10 UP coins per $1 USDC bet.
 * Stored internally as base units: 10 base units per $1.
 * Frontend divides by UP_COINS_DIVISOR (100) to display real coin values.
 *   → $1 bet  = 10 stored = 0.10 UP displayed
 *   → $100 bet = 1000 stored = 10.00 UP displayed
 *
 * Coins are ONLY awarded after pool resolution (at claim time),
 * never at deposit time. This ensures no coins are given for
 * refunded/one-sided pools.
 *
 * Anti-abuse:
 *  - Min bet for coins: $1 USDC (1_000_000 base units)
 *  - Per-wallet daily cap: 50,000 base units (500 UP display)
 *  - Diminishing returns: pools 21-40/day = 50% rate, 41+ = 0%
 */

/** Frontend display divisor: stored / 100 = display UP coins */
export const UP_COINS_DIVISOR = 100;

const USDC_DECIMALS = 1_000_000n; // 6 decimals
const BASE_COINS_PER_USDC = 10n;
const DAILY_WALLET_CAP = 50_000n;
const MIN_BET_FOR_COINS = 1_000_000n; // $1 USDC

/**
 * Trading coins: base units of UP per $1 of notional VOLUME (not stake). Trading
 * is leveraged/high-volume, so the per-$ rate is 1/10th of betting (10 → 1):
 *   1 base unit per $1 → 0.01 UP per $1 → a $1,000 fill = 10 UP (lvl 1).
 * Tunable. No daily cap in v1 — real maker/taker + builder fees deter wash farming.
 */
const TRADE_COINS_BASE_PER_USD = 1;
const MIN_NOTIONAL_FOR_COINS = 1; // $1 notional

/**
 * Coins earned from a HyperLiquid fill, by notional volume × level multiplier.
 * @param notionalUsd - |price × size| of the fill, in whole USD
 * @param level - user's current level
 */
export function calculateCoinsForTrade(notionalUsd: number, level: number): bigint {
  if (!Number.isFinite(notionalUsd) || notionalUsd < MIN_NOTIONAL_FOR_COINS) return 0n;
  const base = Math.floor(notionalUsd) * TRADE_COINS_BASE_PER_USD;
  const multiplier = getLevelMultiplier(level);
  return BigInt(Math.floor(base * multiplier));
}

/**
 * Calculate coins earned from placing a bet.
 * @param betAmountRaw - bet amount in USDC base units (6 decimals)
 * @param level - user's current level
 * @param dailyBetCount - how many bets the user has placed today
 * @param dailyCoinsEarned - how many coins the user has earned today
 * @returns coins to award
 */
export function calculateCoinsForBet(
  betAmountRaw: bigint,
  level: number,
  dailyBetCount: number,
  dailyCoinsEarned: bigint,
): bigint {
  if (betAmountRaw < MIN_BET_FOR_COINS) return 0n;

  const betUsdc = betAmountRaw / USDC_DECIMALS; // whole dollars
  const baseCoins = betUsdc * BASE_COINS_PER_USDC;

  // Diminishing returns based on daily bet count
  let rate: number;
  if (dailyBetCount < 20) {
    rate = 1.0;
  } else if (dailyBetCount < 40) {
    rate = 0.5;
  } else {
    return 0n; // 41+ bets = no coins
  }

  const multiplier = getLevelMultiplier(level);
  const coins = BigInt(Math.floor(Number(baseCoins) * multiplier * rate));

  // Enforce daily cap
  const remaining = DAILY_WALLET_CAP - dailyCoinsEarned;
  if (remaining <= 0n) return 0n;
  return coins > remaining ? remaining : coins;
}

/**
 * Calculate win bonus coins.
 * Win bonus = 50% of base coins × level multiplier
 */
export function calculateWinBonus(
  betAmountRaw: bigint,
  level: number,
  dailyCoinsEarned: bigint,
): bigint {
  if (betAmountRaw < MIN_BET_FOR_COINS) return 0n;

  const betUsdc = betAmountRaw / USDC_DECIMALS;
  const baseCoins = betUsdc * BASE_COINS_PER_USDC;
  const multiplier = getLevelMultiplier(level);
  const bonus = BigInt(Math.floor(Number(baseCoins) * 0.5 * multiplier));

  // Enforce daily cap
  const remaining = DAILY_WALLET_CAP - dailyCoinsEarned;
  if (remaining <= 0n) return 0n;
  return bonus > remaining ? remaining : bonus;
}

/**
 * Win streak bonus coins.
 * streak >= 3: min(streak × 200, 2000)
 */
export function calculateStreakBonus(streak: number, dailyCoinsEarned: bigint): bigint {
  if (streak < 3) return 0n;
  const bonus = BigInt(Math.min(streak * 200, 2000));
  const remaining = DAILY_WALLET_CAP - dailyCoinsEarned;
  if (remaining <= 0n) return 0n;
  return bonus > remaining ? remaining : bonus;
}

/**
 * Level-up bonus: newLevel × 500 coins
 */
export function calculateLevelUpBonus(newLevel: number, dailyCoinsEarned: bigint): bigint {
  const bonus = BigInt(newLevel * 500);
  const remaining = DAILY_WALLET_CAP - dailyCoinsEarned;
  if (remaining <= 0n) return 0n;
  return bonus > remaining ? remaining : bonus;
}
