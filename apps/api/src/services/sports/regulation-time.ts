/**
 * Regulation-time winner helper.
 *
 * In football (and most other timed sports) extra time and penalty shootouts
 * are tie-breakers on top of a draw at the end of regulation. A pool predicting
 * "who wins?" should resolve to the regulation-time result - if the match went
 * to extra time, by definition the score at 90 minutes was a draw.
 *
 * Status strings the major APIs emit when a match went beyond regulation:
 *   - TheSportsDB:        'ET' (extra time, in progress or transiently at finish),
 *                         'AET', 'After Extra Time', 'PEN', 'After Penalties', 'AP'
 *   - football-data.org:  'EXTRA_TIME', 'PENALTY_SHOOTOUT'
 *   - The Odds API:       (no AET indicator - relies on score, won't trigger)
 *
 * SDB is eventually consistent: a match that went to extra time can be reported
 * as 'ET' (still playing ET) and briefly as a bare finished status before settling
 * on 'AET'/'PEN'. 'ET' is included so any path that computes a winner from it
 * collapses to DRAW (if a game reached extra time, the 90' score was a draw).
 *
 * Pools are settled by `winner` rather than the raw final score, so calling
 * this helper at every WRITE path that persists a winner is sufficient.
 */

const EXTRA_TIME_TOKENS = new Set([
  'et',
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

/**
 * Sports that can NEVER end in a tie — MLB (extra innings), NBA (overtime) and
 * NHL (overtime + shootout) always produce a winner. So a tied "final" for these
 * is incomplete / bad upstream data (e.g. a 0-0 the feed hasn't updated yet), not
 * a real result. We reject such phantom draws instead of resolving/voiding on
 * them: the pool stays unresolved so it (a) keeps polling for the true score and
 * (b) can be settled by hand in the admin panel. Football/NFL/MMA can legitimately
 * draw, so they are NOT listed here.
 */
const NO_TIE_SPORTS = new Set(['MLB', 'NBA', 'NHL']);

/** True when a tied final is impossible for this sport/league → treat a tie as bad data. */
export function isNoTieSport(sportOrLeague: string | null | undefined): boolean {
  return !!sportOrLeague && NO_TIE_SPORTS.has(sportOrLeague.trim().toUpperCase());
}

/** Returns true if the given raw status indicates the match went beyond 90 minutes. */
export function wentBeyondRegulation(rawStatus: string | null | undefined): boolean {
  if (!rawStatus) return false;
  return EXTRA_TIME_TOKENS.has(rawStatus.trim().toLowerCase());
}

/**
 * Compute the winner at regulation time. When the match went to extra time
 * or penalties, the score at 90 minutes was tied - return DRAW regardless of
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

/** Plain final-score winner, no regulation-time collapse. */
function scoreWinner(homeScore: number, awayScore: number): 'HOME' | 'AWAY' | 'DRAW' {
  if (homeScore > awayScore) return 'HOME';
  if (awayScore > homeScore) return 'AWAY';
  return 'DRAW';
}

/**
 * Winner for a FINISHED match, applying the 90-minute (regulation) rule ONLY for
 * football/soccer — where a "who wins?" pool settles on the score at 90', so a
 * match decided in extra time or penalties is a DRAW for that bet.
 *
 * For every other sport the final-score winner stands: an NHL shootout ('AP') or
 * an NBA/MLB overtime result IS the real winner, not a draw. This is why callers
 * that handle mixed sports (e.g. the live_scores fallback) must NOT apply
 * `regulationWinner` blindly. `sport` is the source's sport name ('Soccer',
 * 'Ice Hockey', …).
 */
export function finishedWinner(
  sport: string | null | undefined,
  homeScore: number,
  awayScore: number,
  rawStatus: string | null | undefined,
): 'HOME' | 'AWAY' | 'DRAW' {
  const isSoccer = (sport || '').trim().toLowerCase() === 'soccer';
  return isSoccer ? regulationWinner(homeScore, awayScore, rawStatus) : scoreWinner(homeScore, awayScore);
}
