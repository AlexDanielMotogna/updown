import { prisma } from '../db';
import { getAdapter } from './sports';

// Prediction encoding: Home=1, Draw=2, Away=3
export const PREDICTION_HOME = 1n;
export const PREDICTION_DRAW = 2n;
export const PREDICTION_AWAY = 3n;

export function encodePrediction(side: 'HOME' | 'DRAW' | 'AWAY'): bigint {
  switch (side) {
    case 'HOME': return PREDICTION_HOME;
    case 'DRAW': return PREDICTION_DRAW;
    case 'AWAY': return PREDICTION_AWAY;
  }
}

export function decodePrediction(prediction: bigint | null): string | null {
  if (prediction === PREDICTION_HOME) return 'Home';
  if (prediction === PREDICTION_DRAW) return 'Draw';
  if (prediction === PREDICTION_AWAY) return 'Away';
  return null;
}

/**
 * Determine bracket match winner based on football match result.
 * If one predicted correctly and the other didn't → correct wins.
 * If both correct or both wrong → whoever predicted first wins.
 */
export function determineSportsWinner(
  p1Prediction: bigint,
  p2Prediction: bigint,
  actualResult: bigint,
  p1PredictedAt: Date,
  p2PredictedAt: Date,
  p1Wallet: string,
  p2Wallet: string,
): string {
  const p1Correct = p1Prediction === actualResult;
  const p2Correct = p2Prediction === actualResult;

  if (p1Correct && !p2Correct) return p1Wallet;
  if (p2Correct && !p1Correct) return p2Wallet;
  // Both correct or both wrong → tiebreaker: first to predict
  return p1PredictedAt <= p2PredictedAt ? p1Wallet : p2Wallet;
}

/**
 * Encode football match result as BigInt prediction format.
 */
export function encodeMatchResult(homeScore: number, awayScore: number): bigint {
  if (homeScore > awayScore) return PREDICTION_HOME;
  if (awayScore > homeScore) return PREDICTION_AWAY;
  return PREDICTION_DRAW;
}

/**
 * Assign a real football match to all bracket matches in a given round.
 * Picks the next upcoming match from the tournament's league.
 */
export async function assignMatchToRound(
  tournamentId: string,
  round: number,
  league: string,
): Promise<void> {
  const adapter = getAdapter('FOOTBALL');
  const upcoming = await adapter.fetchUpcomingMatches(league);

  if (upcoming.length === 0) {
    console.warn(`[Sports Tournament] No upcoming matches for ${league}`);
    return;
  }

  // Pick the soonest match
  const match = upcoming.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())[0];

  await prisma.tournamentMatch.updateMany({
    where: { tournamentId, round },
    data: {
      footballMatchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeTeamCrest: match.homeTeamCrest || null,
      awayTeamCrest: match.awayTeamCrest || null,
    },
  });

  console.log(`[Sports Tournament] Assigned ${match.homeTeam} vs ${match.awayTeam} to round ${round}`);
}
