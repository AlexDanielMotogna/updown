export interface Match {
  id: string;           // external API match ID
  sport: string;        // 'FOOTBALL' | 'BASKETBALL' etc
  league: string;       // 'CL' | 'PL' | 'PD' etc
  leagueName: string;   // 'Champions League'
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest?: string;  // URL to team crest image
  awayTeamCrest?: string;
  kickoff: Date;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  matchday?: number;
  season?: number;
}

export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';

export interface MatchResult {
  matchId: string;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  winner: 'HOME' | 'AWAY' | 'DRAW';
}

export interface SportAdapter {
  sport: string;
  numSides: number;
  sideLabels: string[];
  fetchUpcomingMatches(league: string): Promise<Match[]>;
  fetchMatchResult(matchId: string): Promise<MatchResult | null>;
  resolveWinner(result: MatchResult): number; // 0=home, 1=away, 2=draw

  /** Fetch fixtures in a date range. Used by fixture sync job. */
  fetchMatchesByDateRange(league: string, dateFrom: string, dateTo: string): Promise<Match[]>;
  /** Batch fetch multiple match results (optional — API-Football supports it). */
  fetchMatchResultsBatch?(matchIds: string[]): Promise<MatchResult[]>;
}
