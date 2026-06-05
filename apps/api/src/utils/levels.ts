/**
 * XP & Level System
 *
 * 40 levels total. Level curve: cumulative_xp(L) = sum of floor(500 × (n-1)^1.8) for n=2..L
 */

// Pre-compute cumulative XP thresholds for each level (1-40)
const LEVEL_THRESHOLDS: bigint[] = [0n]; // index 0 = unused, level 1 = 0 XP

let cumulative = 0n;
for (let level = 2; level <= 40; level++) {
  cumulative += BigInt(Math.floor(500 * Math.pow(level - 1, 1.8)));
  LEVEL_THRESHOLDS.push(cumulative);
}

export { LEVEL_THRESHOLDS };

/**
 * XP required to reach a given level (cumulative from level 1).
 */
export function getXpForLevel(level: number): bigint {
  if (level <= 1) return 0n;
  if (level > 40) return LEVEL_THRESHOLDS[39]!; // cap at 40
  return LEVEL_THRESHOLDS[level - 1]!;
}

/**
 * XP needed to go from current level to the next level.
 */
export function getXpToNextLevel(level: number): bigint {
  if (level >= 40) return 0n;
  return getXpForLevel(level + 1) - getXpForLevel(level);
}

/**
 * Determine current level for a given total XP.
 */
export function getLevelForXp(totalXp: bigint): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 1; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i]!) return i + 1; // threshold at index i = level i+1
  }
  return 1;
}

// Level titles — one per 5-level band, aligned exactly with the milestone
// strip shown on the profile (levels 1,5,10,…,40). A level only earns the
// next title when it reaches that milestone (e.g. level 3 is still Newcomer;
// Observer starts at level 5).
const LEVEL_TITLES: [number, string][] = [
  [1, 'Newcomer'],
  [5, 'Observer'],
  [10, 'Analyst'],
  [15, 'Trader'],
  [20, 'Veteran'],
  [25, 'Expert'],
  [30, 'Legend'],
  [35, 'Titan'],
  [40, 'Apex Legend'],
];

export function getLevelTitle(level: number): string {
  for (let i = LEVEL_TITLES.length - 1; i >= 0; i--) {
    if (level >= LEVEL_TITLES[i]![0]) return LEVEL_TITLES[i]![1];
  }
  return 'Newcomer';
}

/**
 * Earning multiplier for UP Coins based on level.
 */
export function getLevelMultiplier(level: number): number {
  // Bands aligned with the milestone strip: the bonus only steps up AT each
  // milestone level (e.g. levels 5-9 stay at 1.0x; 1.1x starts at level 10).
  if (level < 10) return 1.0;   // 1-9
  if (level < 15) return 1.1;   // 10-14
  if (level < 20) return 1.2;   // 15-19
  if (level < 25) return 1.35;  // 20-24
  if (level < 30) return 1.5;   // 25-29
  if (level < 35) return 1.7;   // 30-34
  if (level < 40) return 1.9;   // 35-39
  return 2.0;                   // 40
}

/**
 * XP award values for various actions.
 */
export const XP_ACTIONS = {
  BET_PLACED: 100n,
  BET_WON: 150n,
  CLAIM_COMPLETED: 50n,
  DAILY_FIRST_BET: 200n,
  /** Win streak bonus: 100 × (streak - 2), capped at streak 10 → 800 */
  winStreakBonus(streak: number): bigint {
    if (streak < 3) return 0n;
    const effective = Math.min(streak, 10);
    return BigInt(100 * (effective - 2));
  },
};
