import { SportAdapter, Match, MatchResult, MatchStatus } from './types';
import { sportsDbFetch } from './api-sports-fetch';
import { regulationWinner } from './regulation-time';

// ── Sport Configurations ────────────────────────────────────────────────────

export interface SportsDbConfig {
  sport: string;          // NBA, NHL, MMA, or league code like CL, PL
  sportQuery: string;     // Sport name for eventsday: 'Basketball', 'Ice Hockey', 'Soccer'
  numSides: number;
  sideLabels: string[];
  leagueFilter?: string;  // Only show this league (e.g., 'NBA', 'NHL')
  leagueId?: string;      // External league ID for eventsnextleague endpoint
}

function mapStatus(status: string | null | undefined): MatchStatus {
  if (!status) return 'SCHEDULED';
  const s = status.toLowerCase();
  if (s === 'not started' || s === 'ns' || s === '') return 'SCHEDULED';
  if (s === 'match finished' || s === 'ft' || s === 'finished' || s === 'aet' || s === 'ap') return 'FINISHED';
  if (s.includes('postpon') || s === 'pst') return 'POSTPONED';
  // Cancelled / abandoned / "awarded"-with-no-play → void & refund. Abandoned
  // (match stopped and not resumed) has no valid result, so we treat it the
  // same as cancelled. Suspended is intentionally left as LIVE — it usually
  // resumes the same day; if it never does, the zombie sweep surfaces it.
  if (s.includes('cancel') || s === 'canc' || s.includes('abandon') || s === 'aban' || s === 'abd') return 'CANCELLED';
  return 'LIVE';
}

/**
 * Combat-sport headliner extractor. UFC events on TheSportsDB don't populate
 * `strHomeTeam` / `strAwayTeam`; the fighters live in `strEvent`, formatted
 * like "UFC Fight Night 278 Muhammad vs Bonfim" or "UFC 329 McGregor vs
 * Holloway 2". We pull whatever appears around the last " vs " and treat
 * the right-hand-side surname (including a trailing rematch number) as the
 * away fighter.
 *
 * Returns null when the event title doesn't include a "vs" pair we can
 * parse — the caller drops these events instead of polluting the cache
 * with unusable rows.
 */
function parseHeadlinerFromTitle(strEvent: string | null | undefined): { home: string; away: string } | null {
  if (!strEvent) return null;
  // Use the LAST occurrence of " vs " so prefixes like "UFC X" or "Bellator Y"
  // never bleed into the home name even if they contain "v" letters.
  const idx = strEvent.search(/\svs\.?\s+/i);
  if (idx < 0) return null;
  const left = strEvent.slice(0, idx).trim();
  const right = strEvent.slice(idx).replace(/^\s*vs\.?\s+/i, '').trim();
  if (!left || !right) return null;
  // Trim off the event prefix from the left side: drop everything before
  // (and including) the last numeric token, then keep what's left.
  // "UFC Fight Night 278 Muhammad" → "Muhammad"
  // "UFC 329 McGregor"             → "McGregor"
  const lastNumMatch = left.match(/^(.*\d+)\s+(.+)$/);
  const home = lastNumMatch ? lastNumMatch[2].trim() : left;
  if (!home || !right) return null;
  return { home, away: right };
}

// Minimal shape of a TheSportsDB event row — only the fields read here.
export interface SportsDbEvent {
  idEvent?: string | number | null;
  strEvent?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  strLeague?: string | null;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strStatus?: string | null;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
  intRound?: string | number | null;
}

function mapEvent(e: SportsDbEvent, sport: string, leagueOverride?: string): Match | null {
  if (!e.idEvent) return null;

  // Combat sports: SDB leaves strHomeTeam/strAwayTeam null and stores the
  // fighters inside strEvent. Parse it; everything else (kickoff, badges
  // etc.) still uses the standard fields.
  let homeTeam: string | null = e.strHomeTeam || null;
  let awayTeam: string | null = e.strAwayTeam || null;
  if (!homeTeam || !awayTeam) {
    const headliner = parseHeadlinerFromTitle(e.strEvent);
    if (!headliner) return null;
    homeTeam = headliner.home;
    awayTeam = headliner.away;
  }

  const kickoff = e.dateEvent && e.strTime
    ? new Date(`${e.dateEvent}T${e.strTime}+00:00`)
    : e.dateEvent ? new Date(e.dateEvent) : null;
  if (!kickoff || isNaN(kickoff.getTime())) return null;

  return {
    id: String(e.idEvent),
    sport,
    league: leagueOverride || sport,
    leagueName: e.strLeague || sport,
    homeTeam,
    awayTeam,
    homeTeamCrest: e.strHomeTeamBadge || undefined,
    awayTeamCrest: e.strAwayTeamBadge || undefined,
    kickoff,
    status: mapStatus(e.strStatus),
    rawStatus: e.strStatus ?? null,
    homeScore: e.intHomeScore != null ? Number(e.intHomeScore) : undefined,
    awayScore: e.intAwayScore != null ? Number(e.intAwayScore) : undefined,
    matchday: e.intRound != null ? Number(e.intRound) : undefined,
  };
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ── Configs ─────────────────────────────────────────────────────────────────

export const SPORTSDB_CONFIGS: SportsDbConfig[] = [
  {
    sport: 'NBA',
    sportQuery: 'Basketball',
    numSides: 2,
    sideLabels: ['Home', 'Away'],
    leagueFilter: 'NBA',
  },
  {
    sport: 'NHL',
    sportQuery: 'Ice Hockey',
    numSides: 2,
    sideLabels: ['Home', 'Away'],
    leagueFilter: 'NHL',
  },
  {
    sport: 'MMA',
    sportQuery: 'Fighting',
    numSides: 2,
    sideLabels: ['Fighter 1', 'Fighter 2'],
    leagueFilter: 'UFC',
  },
  {
    sport: 'NFL',
    sportQuery: 'American Football',
    numSides: 2,
    sideLabels: ['Home', 'Away'],
    leagueFilter: 'NFL',
  },
];

// ── Adapter ─────────────────────────────────────────────────────────────────

const DAYS_AHEAD = 7; // days to fetch when using eventsday fallback

export class SportsDbAdapter implements SportAdapter {
  sport: string;
  numSides: number;
  sideLabels: string[];

  constructor(private config: SportsDbConfig) {
    this.sport = config.sport;
    this.numSides = config.numSides;
    this.sideLabels = config.sideLabels;
  }

  async fetchUpcomingMatches(league: string): Promise<Match[]> {
    // Primary: use eventsnextleague when we have a league ID (returns ~25 upcoming events)
    if (this.config.leagueId) {
      const data = await sportsDbFetch<{ events?: SportsDbEvent[] | null }>(`eventsnextleague.php?id=${this.config.leagueId}`);
      const events = data?.events || [];
      return events
        .map((e: SportsDbEvent) => mapEvent(e, this.config.sport, league))
        .filter((m: Match | null): m is Match => m !== null);
    }

    // Fallback: fetch multiple days ahead via eventsday (for sports without leagueId)
    const allMatches: Match[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < DAYS_AHEAD; i++) {
      const date = formatDate(addDays(new Date(), i));
      try {
        const data = await sportsDbFetch<{ events?: SportsDbEvent[] | null }>(`eventsday.php?d=${date}&s=${encodeURIComponent(this.config.sportQuery)}`);
        const events = data?.events || [];

        for (const e of events) {
          const m = mapEvent(e, this.config.sport, league);
          if (!m) continue;
          if (seen.has(m.id)) continue;
          // Apply league filter (exact match, case-insensitive). Both
          // sides uppercase so a category stored as 'Boxing' (mixed-case
          // from SDB's strLeague) matches an event's strLeague the same
          // way the hardcoded NBA/NHL/NFL configs do.
          if (this.config.leagueFilter) {
            const leagueName = (m.leagueName || '').toUpperCase();
            if (leagueName !== this.config.leagueFilter.toUpperCase()) continue;
          }
          seen.add(m.id);
          allMatches.push(m);
        }
      } catch { /* skip individual day failures */ }
    }

    return allMatches;
  }

  async fetchMatchResult(matchId: string): Promise<MatchResult | null> {
    const data = await sportsDbFetch<{ events?: SportsDbEvent[] | null }>(`lookupevent.php?id=${matchId}`);
    const e = data?.events?.[0];
    if (!e) return null;

    const status = mapStatus(e.strStatus);
    if (status !== 'FINISHED') return null;

    const home = Number(e.intHomeScore ?? 0);
    const away = Number(e.intAwayScore ?? 0);
    // Use regulation-time rules - football pools settle on the 90-minute
    // result, so AET/PEN scores become DRAW even if one side eventually won.
    const winner = regulationWinner(home, away, e.strStatus);

    return {
      matchId: String(e.idEvent),
      status: 'FINISHED',
      rawStatus: e.strStatus ?? null,
      homeScore: home,
      awayScore: away,
      winner,
    };
  }

  async fetchMatchesByDateRange(league: string, _dateFrom: string, _dateTo: string): Promise<Match[]> {
    return this.fetchUpcomingMatches(league);
  }

  resolveWinner(result: MatchResult): number {
    if (result.winner === 'HOME') return 0;
    if (result.winner === 'AWAY') return 1;
    return 2;
  }
}
