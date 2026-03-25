import { SportAdapter, Match, MatchResult, MatchStatus } from './types';
import { footballFetch } from './football-fetch';

function mapStatus(apiStatus: string): MatchStatus {
  switch (apiStatus) {
    case 'SCHEDULED':
    case 'TIMED':
      return 'SCHEDULED';
    case 'IN_PLAY':
    case 'PAUSED':
    case 'HALFTIME':
      return 'LIVE';
    case 'FINISHED':
      return 'FINISHED';
    case 'POSTPONED':
      return 'POSTPONED';
    case 'CANCELLED':
    case 'SUSPENDED':
      return 'CANCELLED';
    default:
      return 'SCHEDULED';
  }
}

export class FootballAdapter implements SportAdapter {
  sport = 'FOOTBALL';
  numSides = 3;
  sideLabels = ['Home', 'Draw', 'Away'];

  async fetchUpcomingMatches(league: string): Promise<Match[]> {
    const data = await footballFetch(`/competitions/${league}/matches?status=SCHEDULED,TIMED&limit=20`);

    // Only return the next matchday (e.g., just leg 1 or just leg 2)
    const matches = data.matches || [];
    const nextMatchday = matches.length > 0
      ? Math.min(...matches.filter((m: any) => m.matchday != null).map((m: any) => m.matchday))
      : null;

    const filtered = nextMatchday != null
      ? matches.filter((m: any) => m.matchday === nextMatchday && m.homeTeam?.id != null)
      : matches.filter((m: any) => m.homeTeam?.id != null);

    return filtered.map((m: any) => ({
      id: String(m.id),
      sport: 'FOOTBALL',
      league,
      leagueName: data.competition?.name || league,
      homeTeam: m.homeTeam?.shortName || m.homeTeam?.name || 'Home',
      awayTeam: m.awayTeam?.shortName || m.awayTeam?.name || 'Away',
      homeTeamCrest: m.homeTeam?.crest || null,
      awayTeamCrest: m.awayTeam?.crest || null,
      kickoff: new Date(m.utcDate),
      status: mapStatus(m.status),
      homeScore: m.score?.fullTime?.home ?? undefined,
      awayScore: m.score?.fullTime?.away ?? undefined,
    }));
  }

  async fetchMatchResult(matchId: string): Promise<MatchResult | null> {
    try {
      const m = await footballFetch(`/matches/${matchId}`);
      const status = mapStatus(m.status);

      if (status !== 'FINISHED') return null;

      const homeScore = m.score?.fullTime?.home ?? 0;
      const awayScore = m.score?.fullTime?.away ?? 0;

      return {
        matchId: String(m.id),
        status,
        homeScore,
        awayScore,
        winner: homeScore > awayScore ? 'HOME' : awayScore > homeScore ? 'AWAY' : 'DRAW',
      };
    } catch {
      return null;
    }
  }

  async fetchMatchesByDateRange(league: string, dateFrom: string, dateTo: string): Promise<Match[]> {
    const data = await footballFetch(
      `/competitions/${league}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`
    );

    return (data.matches || [])
      .filter((m: any) => m.homeTeam?.id != null)
      .map((m: any) => ({
        id: String(m.id),
        sport: 'FOOTBALL',
        league,
        leagueName: data.competition?.name || league,
        homeTeam: m.homeTeam?.shortName || m.homeTeam?.name || 'Home',
        awayTeam: m.awayTeam?.shortName || m.awayTeam?.name || 'Away',
        homeTeamCrest: m.homeTeam?.crest || null,
        awayTeamCrest: m.awayTeam?.crest || null,
        kickoff: new Date(m.utcDate),
        status: mapStatus(m.status),
        homeScore: m.score?.fullTime?.home ?? undefined,
        awayScore: m.score?.fullTime?.away ?? undefined,
        matchday: m.matchday ?? undefined,
        season: m.season?.id ?? undefined,
      }));
  }

  resolveWinner(result: MatchResult): number {
    switch (result.winner) {
      case 'HOME': return 0;  // Side::Up
      case 'AWAY': return 1;  // Side::Down
      case 'DRAW': return 2;  // Side::Draw
    }
  }
}
