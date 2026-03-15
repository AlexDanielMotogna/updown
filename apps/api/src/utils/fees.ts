/**
 * Level-based platform fee schedule.
 * Returns fee in basis points (e.g. 500 = 5%).
 */
export function getFeeBps(level: number): number {
  if (level < 5) return 500;   // 5.00%
  if (level < 10) return 475;  // 4.75%
  if (level < 15) return 450;  // 4.50%
  if (level < 20) return 425;  // 4.25%
  if (level < 25) return 400;  // 4.00%
  if (level < 30) return 375;  // 3.75%
  if (level < 35) return 350;  // 3.50%
  if (level < 40) return 325;  // 3.25%
  return 300;                  // 3.00% at level 40
}

/** Default fee for anonymous / unregistered users */
export const DEFAULT_FEE_BPS = 500;
