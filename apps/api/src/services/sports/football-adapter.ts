import { SportAdapter, Match, MatchResult, MatchStatus } from './types';

const API_BASE = 'https://api.football-data.org/v4';
const API_TOKEN = process.env.FOOTBALL_DATA_API_KEY || '';

async function footballFetch(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Auth-Token': API_TOKEN },
  });
  if (!res.ok) {
    throw new Error(`Football API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

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
  sideLabels = ['Home', 'Away', 'Draw'];

  async fetchUpcomingMatches(league: string): Promise<Match[]> {
    const data = await footballFetch(`/competitions/${league}/matches?status=SCHEDULED,TIMED&limit=20`);

    return (data.matches || []).map((m: any) => ({
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

  resolveWinner(result: MatchResult): number {
    switch (result.winner) {
      case 'HOME': return 0;  // Side::Up
      case 'AWAY': return 1;  // Side::Down
      case 'DRAW': return 2;  // Side::Draw
    }
  }
}
