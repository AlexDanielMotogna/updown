import { SportAdapter, Match, MatchResult, MatchStatus } from './types';
import { sportsDbFetch, sportsDbFetchV2 } from './api-sports-fetch';

// ── Sport Configurations ────────────────────────────────────────────────────

export interface SportsDbConfig {
  sport: string;          // NBA, NHL, MMA
  sportQuery: string;     // TheSportsDB sport name: 'Basketball', 'Ice Hockey', 'Fighting'
  numSides: number;
  sideLabels: string[];
  leagueFilter?: string;  // Only show this league (e.g., 'NBA', 'NHL')
}

function mapStatus(status: string | null): MatchStatus {
  if (!status) return 'SCHEDULED';
  const s = status.toLowerCase();
  if (s === 'not started' || s === 'ns' || s === '') return 'SCHEDULED';
  if (s === 'match finished' || s === 'ft' || s === 'finished' || s === 'aet' || s === 'ap') return 'FINISHED';
  if (s === 'postponed' || s === 'pst') return 'POSTPONED';
  if (s === 'cancelled' || s === 'canc') return 'CANCELLED';
  // Anything else is likely in-progress
  return 'LIVE';
}

function mapEvent(e: any, sport: string): Match | null {
  if (!e.idEvent || !e.strHomeTeam || !e.strAwayTeam) return null;

  const kickoff = e.dateEvent && e.strTime
    ? new Date(`${e.dateEvent}T${e.strTime}+00:00`)
    : e.dateEvent ? new Date(e.dateEvent) : null;
  if (!kickoff || isNaN(kickoff.getTime())) return null;

  return {
    id: String(e.idEvent),
    sport,
    league: sport,
    leagueName: e.strLeague || sport,
    homeTeam: e.strHomeTeam,
    awayTeam: e.strAwayTeam,
    homeTeamCrest: e.strHomeTeamBadge || undefined,
    awayTeamCrest: e.strAwayTeamBadge || undefined,
    kickoff,
    status: mapStatus(e.strStatus),
    homeScore: e.intHomeScore != null ? Number(e.intHomeScore) : undefined,
    awayScore: e.intAwayScore != null ? Number(e.intAwayScore) : undefined,
  };
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

export class SportsDbAdapter implements SportAdapter {
  sport: string;
  numSides: number;
  sideLabels: string[];

  constructor(private config: SportsDbConfig) {
    this.sport = config.sport;
    this.numSides = config.numSides;
    this.sideLabels = config.sideLabels;
  }

  async fetchUpcomingMatches(_league: string): Promise<Match[]> {
    // Fetch next 15 events for this sport
    const today = new Date().toISOString().slice(0, 10);
    const data = await sportsDbFetch(`eventsday.php?d=${today}&s=${encodeURIComponent(this.config.sportQuery)}`);
    const events = data?.events || [];

    return events
      .map((e: any) => mapEvent(e, this.config.sport))
      .filter((m: Match | null): m is Match => {
        if (!m) return false;
        // Filter to specific league if configured
        if (this.config.leagueFilter) {
          const league = (m.leagueName || '').toUpperCase();
          return league === this.config.leagueFilter;
        }
        return true;
      });
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
      winner: home > away ? 'HOME' : 'AWAY', // 2-way, no draw
    };
  }

  async fetchMatchesByDateRange(_league: string, dateFrom: string, _dateTo: string): Promise<Match[]> {
    // TheSportsDB only supports single-day queries, fetch from dateFrom
    return this.fetchUpcomingMatches(_league);
  }

  resolveWinner(result: MatchResult): number {
    return result.winner === 'HOME' ? 0 : 1;
  }
}
