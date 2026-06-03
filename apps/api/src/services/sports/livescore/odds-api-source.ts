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

const SPORT_KEY_TO_NAME: Record<string, string> = {
  basketball_nba: 'Basketball',
  icehockey_nhl: 'Ice Hockey',
  americanfootball_nfl: 'American Football',
  mma_mixed_martial_arts: 'Fighting',
};

function sportKeyToName(key: string): string {
  return SPORT_KEY_TO_NAME[key] || (key.startsWith('soccer_') ? 'Soccer' : key);
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
 * Schedulers occasionally reschedule by an hour or two (rain
 * delays, broadcast slot changes); 4h is generous without being
 * permissive enough to ever match a back-to-back same-team game.
 */
const KICKOFF_TOLERANCE_MS = 4 * 3600_000;

export function matchGamesToPools(
  games: OddsApiGame[],
  pools: Array<{ matchId: string; homeTeam: string; awayTeam: string; league: string; startTime: Date }>,
): LiveScore[] {
  const results: LiveScore[] = [];

  for (const pool of pools) {
    const homeNorm = normalizeTeam(pool.homeTeam);
    const awayNorm = normalizeTeam(pool.awayTeam);
    const poolStartMs = pool.startTime.getTime();

    const matched = games.find(g => {
      if (!g.scores) return false;
      const gHome = normalizeTeam(g.home_team);
      const gAway = normalizeTeam(g.away_team);
      const teamsMatch =
        (gHome === homeNorm && gAway === awayNorm) ||
        (gHome === awayNorm && gAway === homeNorm);
      if (!teamsMatch) return false;
      // Reject games whose commence_time is more than KICKOFF_TOLERANCE_MS
      // off our pool kickoff — almost certainly a different fixture
      // (yesterday's game, tomorrow's game, a doubleheader, etc.).
      const gameMs = Date.parse(g.commence_time);
      if (Number.isNaN(gameMs)) return false;
      return Math.abs(gameMs - poolStartMs) <= KICKOFF_TOLERANCE_MS;
    });

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
