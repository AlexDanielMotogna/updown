import { SportAdapter, Match, MatchResult, MatchStatus } from './types';

/**
 * Basketball adapter skeleton.
 * 2-way outcomes only (Home/Away) — no draws in basketball.
 * Wire up a real API (e.g. API-Basketball, ESPN) when ready.
 */
export class BasketballAdapter implements SportAdapter {
  sport = 'BASKETBALL';
  numSides = 2;
  sideLabels = ['Home', 'Away'];

  async fetchUpcomingMatches(league: string): Promise<Match[]> {
    // TODO: integrate a basketball API (API-Basketball, balldontlie, ESPN, etc.)
    throw new Error(`Basketball API not configured — cannot fetch matches for ${league}`);
  }

  async fetchMatchResult(matchId: string): Promise<MatchResult | null> {
    throw new Error(`Basketball API not configured — cannot fetch result for ${matchId}`);
  }

  async fetchMatchesByDateRange(league: string, dateFrom: string, dateTo: string): Promise<Match[]> {
    throw new Error(`Basketball API not configured — cannot fetch matches for ${league} (${dateFrom} to ${dateTo})`);
  }

  resolveWinner(result: MatchResult): number {
    // Basketball has no draws — higher score wins
    return result.homeScore > result.awayScore ? 0 : 1;
  }
}
