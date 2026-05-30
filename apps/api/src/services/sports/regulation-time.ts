/**
 * Regulation-time winner helper.
 *
 * In football (and most other timed sports) extra time and penalty shootouts
 * are tie-breakers on top of a draw at the end of regulation. A pool predicting
 * "who wins?" should resolve to the regulation-time result — if the match went
 * to extra time, by definition the score at 90 minutes was a draw.
 *
 * Status strings the major APIs emit when a match went beyond regulation:
 *   - TheSportsDB:        'AET', 'After Extra Time', 'PEN', 'After Penalties', 'AP'
 *   - football-data.org:  'EXTRA_TIME', 'PENALTY_SHOOTOUT'
 *   - The Odds API:       (no AET indicator — relies on score, won't trigger)
 *
 * Pools are settled by `winner` rather than the raw final score, so calling
 * this helper at every WRITE path that persists a winner is sufficient.
 */

const EXTRA_TIME_TOKENS = new Set([
  'aet',
  'ap',
  'pen',
  'after extra time',
  'after penalties',
  'penalty shootout',
  'penalties',
  'extra_time',
  'extra time',
  'penalty_shootout',
]);

/** Returns true if the given raw status indicates the match went beyond 90 minutes. */
export function wentBeyondRegulation(rawStatus: string | null | undefined): boolean {
  if (!rawStatus) return false;
  return EXTRA_TIME_TOKENS.has(rawStatus.trim().toLowerCase());
}

/**
 * Compute the winner at regulation time. When the match went to extra time
 * or penalties, the score at 90 minutes was tied — return DRAW regardless of
 * what the post-AET/PEN final score says.
 */
export function regulationWinner(
  homeScore: number,
  awayScore: number,
  rawStatus: string | null | undefined,
): 'HOME' | 'AWAY' | 'DRAW' {
  if (wentBeyondRegulation(rawStatus)) return 'DRAW';
  if (homeScore > awayScore) return 'HOME';
  if (awayScore > homeScore) return 'AWAY';
  return 'DRAW';
}
