import { SportAdapter, Match, MatchResult, MatchStatus } from './types';
import { sportsDbFetch } from './api-sports-fetch';

// ── Sport Configurations ────────────────────────────────────────────────────

export interface SportsDbConfig {
  sport: string;          // NBA, NHL, MMA, or league code like CL, PL
  sportQuery: string;     // Sport name for eventsday: 'Basketball', 'Ice Hockey', 'Soccer'
  numSides: number;
  sideLabels: string[];
  leagueFilter?: string;  // Only show this league (e.g., 'NBA', 'NHL')
  leagueId?: string;      // External league ID for eventsnextleague endpoint
}

function mapStatus(status: string | null): MatchStatus {
  if (!status) return 'SCHEDULED';
  const s = status.toLowerCase();
  if (s === 'not started' || s === 'ns' || s === '') return 'SCHEDULED';
  if (s === 'match finished' || s === 'ft' || s === 'finished' || s === 'aet' || s === 'ap') return 'FINISHED';
  if (s === 'postponed' || s === 'pst') return 'POSTPONED';
  if (s === 'cancelled' || s === 'canc') return 'CANCELLED';
  return 'LIVE';
}

function mapEvent(e: any, sport: string, leagueOverride?: string): Match | null {
  if (!e.idEvent || !e.strHomeTeam || !e.strAwayTeam) return null;

  const kickoff = e.dateEvent && e.strTime
    ? new Date(`${e.dateEvent}T${e.strTime}+00:00`)
    : e.dateEvent ? new Date(e.dateEvent) : null;
  if (!kickoff || isNaN(kickoff.getTime())) return null;

  return {
    id: String(e.idEvent),
    sport,
    league: leagueOverride || sport,
    leagueName: e.strLeague || sport,
    homeTeam: e.strHomeTeam,
    awayTeam: e.strAwayTeam,
    homeTeamCrest: e.strHomeTeamBadge || undefined,
    awayTeamCrest: e.strAwayTeamBadge || undefined,
    kickoff,
    status: mapStatus(e.strStatus),
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
      const data = await sportsDbFetch(`eventsnextleague.php?id=${this.config.leagueId}`);
      const events = data?.events || [];
      return events
        .map((e: any) => mapEvent(e, this.config.sport, league))
        .filter((m: Match | null): m is Match => m !== null);
    }

    // Fallback: fetch multiple days ahead via eventsday (for sports without leagueId)
    const allMatches: Match[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < DAYS_AHEAD; i++) {
      const date = formatDate(addDays(new Date(), i));
      try {
        const data = await sportsDbFetch(`eventsday.php?d=${date}&s=${encodeURIComponent(this.config.sportQuery)}`);
        const events = data?.events || [];

        for (const e of events) {
          const m = mapEvent(e, this.config.sport, league);
          if (!m) continue;
          if (seen.has(m.id)) continue;
          // Apply league filter (exact match)
          if (this.config.leagueFilter) {
            const leagueName = (m.leagueName || '').toUpperCase();
            if (leagueName !== this.config.leagueFilter) continue;
          }
          seen.add(m.id);
          allMatches.push(m);
        }
      } catch { /* skip individual day failures */ }
    }

    return allMatches;
  }

  async fetchMatchResult(matchId: string): Promise<MatchResult | null> {
    const data = await sportsDbFetch(`lookupevent.php?id=${matchId}`);
    const e = data?.events?.[0];
    if (!e) return null;

    const status = mapStatus(e.strStatus);
    if (status !== 'FINISHED') return null;

    const home = Number(e.intHomeScore ?? 0);
    const away = Number(e.intAwayScore ?? 0);

    return {
      matchId: String(e.idEvent),
      status: 'FINISHED',
      homeScore: home,
      awayScore: away,
      winner: home > away ? 'HOME' : away > home ? 'AWAY' : 'DRAW',
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
