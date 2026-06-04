import type { LiveScore } from './types';
import { LEAGUE_TO_ODDS_API, ODDS_API_CREDIT_FLOOR, normalizeTeam } from './types';

// ─── State ───────────────────────────────────────────────────────────────────

export let oddsApiCallsTotal = 0;
export let oddsApiSuccessTotal = 0;
export let oddsApiCreditsRemaining: number | null = null;
export let oddsApiCreditsUsed: number | null = null;

// ─── Types ───────────────────────────────────────────────────────────────────

interface OddsApiGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: Array<{ name: string; score: string }> | null;
  last_update: string | null;
}

// ─── Sport name mapping ─────────────────────────────────────────────────────

// Odds API sport_key → SDB strSport canonical name. Anything we
// persist into `live_scores.sport` (and therefore into the observed
// coverage set in pool-validation.ts) flows through this. Missing
// entries used to leak the raw key (e.g. "baseball_mlb") into the
// effective whitelist — harmless for filtering since "Baseball" came
// through other rows, but ugly in the admin UI and a footgun if a
// new sport_key showed up without a matching mapping.
const SPORT_KEY_TO_NAME: Record<string, string> = {
  basketball_nba: 'Basketball',
  icehockey_nhl: 'Ice Hockey',
  americanfootball_nfl: 'American Football',
  baseball_mlb: 'Baseball',
  mma_mixed_martial_arts: 'Fighting',
  boxing_boxing: 'Fighting',
  // Tennis sport_keys come in many flavours (atp_french_open,
  // wta_us_open, …). The prefix branch handles them generically below.
};

// Prefix → canonical mapping for sport_key families. Order matters
// only for keys that share a prefix, which Odds API avoids by design.
const SPORT_KEY_PREFIXES: Array<[string, string]> = [
  ['soccer_', 'Soccer'],
  ['tennis_', 'Tennis'],
  ['golf_', 'Golf'],
  ['cricket_', 'Cricket'],
  ['rugbyleague_', 'Rugby'],
  ['rugbyunion_', 'Rugby'],
  ['basketball_', 'Basketball'],
  ['icehockey_', 'Ice Hockey'],
  ['americanfootball_', 'American Football'],
  ['baseball_', 'Baseball'],
  ['mma_', 'Fighting'],
  ['boxing_', 'Fighting'],
];

function sportKeyToName(key: string): string {
  const direct = SPORT_KEY_TO_NAME[key];
  if (direct) return direct;
  for (const [prefix, name] of SPORT_KEY_PREFIXES) {
    if (key.startsWith(prefix)) return name;
  }
  // Unknown family. Fall back to the raw key so the row still
  // persists; the operator notices it in `/admin/sports/coverage` and
  // either adds the prefix mapping or sets SPORTS_POOL_WHITELIST.
  return key;
}

// ─── Parallel poller ─────────────────────────────────────────────────────────

/**
 * Fetch ALL live scores from The Odds API for a given sport.
 * Runs in parallel with TheSportsDB every 30s.
 * Returns raw games - caller matches to pools.
 *
 * @param daysFrom - 1 to include yesterday's completed games (costs 2 credits instead of 1)
 */
export async function fetchOddsApiScores(
  sportKey: string,
  daysFrom?: number,
): Promise<OddsApiGame[]> {
  const apiKey = process.env.THE_ODDS_API;
  if (!apiKey) return [];

  if (oddsApiCreditsRemaining !== null && oddsApiCreditsRemaining < ODDS_API_CREDIT_FLOOR) return [];

  oddsApiCallsTotal++;

  try {
    let url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${apiKey}`;
    if (daysFrom) url += `&daysFrom=${daysFrom}`;

    const res = await fetch(url);

    const remaining = res.headers.get('x-requests-remaining');
    const used = res.headers.get('x-requests-used');
    if (remaining !== null) oddsApiCreditsRemaining = parseInt(remaining, 10);
    if (used !== null) oddsApiCreditsUsed = parseInt(used, 10);

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) oddsApiCreditsRemaining = 0;
      return [];
    }

    const games = (await res.json()) as OddsApiGame[];
    return Array.isArray(games) ? games : [];
  } catch {
    return [];
  }
}

/**
 * Match Odds API games to active pools by team name **AND** kickoff
 * time. Without the time match we'd happily return yesterday's
 * 8-0 Tigers win for today's Rays vs Tigers fixture — the same
 * (home_team, away_team) pair repeats every day for back-to-back
 * MLB / NHL series, and `/scores?daysFrom=1` returns the last 24h
 * inclusive.
 *
 * KICKOFF_TOLERANCE_MS — how far apart the Odds API commence_time
 * can drift from our pool.startTime and still count as the same game.
 * Tightened to 3h after the doubleheader edge-case audit:
 *   • 4h would allow a 13:00 + 17:00 MLB doubleheader (4h apart) to
 *     get confused if either matched first.
 *   • 3h still covers all reasonable rain-delay reschedules (real
 *     MLB delays cap around 2h; longer ones get the game pushed to
 *     the next day, no team-name collision risk).
 *
 * Multiple-match safety: even within tolerance, if MORE than one
 * candidate game still matches (a real same-day doubleheader < 3h
 * apart), we pick the one CLOSEST to pool.startTime. That makes the
 * Rays vs Tigers 13:00 pool match the 13:00 game, not the 14:30 game
 * that's also within ±3h.
 */
const KICKOFF_TOLERANCE_MS = 3 * 3600_000;

export function matchGamesToPools(
  games: OddsApiGame[],
  pools: Array<{ matchId: string; homeTeam: string; awayTeam: string; league: string; startTime: Date }>,
): LiveScore[] {
  const results: LiveScore[] = [];

  for (const pool of pools) {
    const homeNorm = normalizeTeam(pool.homeTeam);
    const awayNorm = normalizeTeam(pool.awayTeam);
    const poolStartMs = pool.startTime.getTime();

    // Collect all candidates first, then pick the closest commence_time
    // to pool.startTime. Doubleheader-safe: when two games for the same
    // teams both fall within the tolerance window, the temporally
    // closest one wins. Without this loop a same-day pre-3h game would
    // match the 'find first' candidate even if the real game is at
    // 4pm.
    let matched: OddsApiGame | null = null;
    let matchedDelta = Number.POSITIVE_INFINITY;
    for (const g of games) {
      if (!g.scores) continue;
      const gHome = normalizeTeam(g.home_team);
      const gAway = normalizeTeam(g.away_team);
      const teamsMatch =
        (gHome === homeNorm && gAway === awayNorm) ||
        (gHome === awayNorm && gAway === homeNorm);
      if (!teamsMatch) continue;
      const gameMs = Date.parse(g.commence_time);
      if (Number.isNaN(gameMs)) continue;
      const delta = Math.abs(gameMs - poolStartMs);
      if (delta > KICKOFF_TOLERANCE_MS) continue;
      if (delta < matchedDelta) {
        matched = g;
        matchedDelta = delta;
      }
    }

    if (!matched || !matched.scores) continue;

    const homeEntry = matched.scores.find(s => normalizeTeam(s.name) === normalizeTeam(matched.home_team));
    const awayEntry = matched.scores.find(s => normalizeTeam(s.name) === normalizeTeam(matched.away_team));
    if (!homeEntry || !awayEntry) continue;

    const hs = parseInt(homeEntry.score, 10);
    const as = parseInt(awayEntry.score, 10);
    if (isNaN(hs) || isNaN(as) || hs < 0 || as < 0) continue;

    const swapped = normalizeTeam(matched.home_team) !== homeNorm;
    const sportKey = LEAGUE_TO_ODDS_API[pool.league] || '';

    results.push({
      eventId: pool.matchId,
      homeScore: swapped ? as : hs,
      awayScore: swapped ? hs : as,
      status: matched.completed ? 'FT' : 'LIVE',
      progress: '',
      homeTeam: pool.homeTeam,
      awayTeam: pool.awayTeam,
      league: pool.league,
      sport: sportKeyToName(sportKey),
      homeTeamBadge: '',
      awayTeamBadge: '',
      updatedAt: Date.now(),
    });

    oddsApiSuccessTotal++;
  }

  return results;
}

/**
 * Get unique Odds API sport keys for a list of league codes.
 */
export function getOddsApiSportKeys(leagues: string[]): string[] {
  const keys = new Set<string>();
  for (const league of leagues) {
    const key = LEAGUE_TO_ODDS_API[league];
    if (key) keys.add(key);
  }
  return [...keys];
}

export function isOddsApiDisabled(): boolean {
  return !process.env.THE_ODDS_API ||
    (oddsApiCreditsRemaining !== null && oddsApiCreditsRemaining < ODDS_API_CREDIT_FLOOR);
}
