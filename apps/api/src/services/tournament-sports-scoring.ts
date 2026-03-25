/**
 * Matchday scoring logic for sports tournaments.
 * Each player predicts Home/Draw/Away for every fixture + total goals tiebreaker.
 */

export const POINTS_PER_CORRECT = 3;

export interface MatchdayPrediction {
  outcomes: string[];   // ["HOME", "DRAW", "AWAY", ...]
  totalGoals: number;
}

export function parseMatchdayPrediction(raw: string | null): MatchdayPrediction | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      outcomes: parsed.outcomes || [],
      totalGoals: typeof parsed.totalGoals === 'number' ? parsed.totalGoals : 0,
    };
  } catch {
    return null;
  }
}

export function serializeMatchdayPrediction(outcomes: string[], totalGoals: number): string {
  return JSON.stringify({ outcomes, totalGoals });
}

/**
 * Count correct outcome predictions.
 */
export function scoreOutcomes(predictions: string[], actualOutcomes: string[]): number {
  let correct = 0;
  for (let i = 0; i < actualOutcomes.length; i++) {
    if (predictions[i] === actualOutcomes[i]) correct++;
  }
  return correct;
}

/**
 * Determine the winner of a bracket match based on matchday predictions.
 *
 * 1. Most correct predictions wins
 * 2. Tie → closest total goals prediction
 * 3. Still tied → first to predict (timestamp)
 */
export function determineMatchdayWinner(
  p1: { prediction: MatchdayPrediction; predictedAt: Date; wallet: string },
  p2: { prediction: MatchdayPrediction; predictedAt: Date; wallet: string },
  actualOutcomes: string[],
  actualTotalGoals: number,
): { winner: string; p1Score: number; p2Score: number } {
  const p1Score = scoreOutcomes(p1.prediction.outcomes, actualOutcomes);
  const p2Score = scoreOutcomes(p2.prediction.outcomes, actualOutcomes);

  // 1. Most correct predictions
  if (p1Score > p2Score) return { winner: p1.wallet, p1Score, p2Score };
  if (p2Score > p1Score) return { winner: p2.wallet, p1Score, p2Score };

  // 2. Closest total goals
  const p1Dist = Math.abs(p1.prediction.totalGoals - actualTotalGoals);
  const p2Dist = Math.abs(p2.prediction.totalGoals - actualTotalGoals);
  if (p1Dist < p2Dist) return { winner: p1.wallet, p1Score, p2Score };
  if (p2Dist < p1Dist) return { winner: p2.wallet, p1Score, p2Score };

  // 3. First to predict
  const winner = p1.predictedAt <= p2.predictedAt ? p1.wallet : p2.wallet;
  return { winner, p1Score, p2Score };
}

/**
 * Compute actual total goals from fixture results.
 */
export function computeTotalGoals(fixtures: Array<{ resultHome: number | null; resultAway: number | null }>): number {
  return fixtures.reduce((sum, f) => sum + (f.resultHome ?? 0) + (f.resultAway ?? 0), 0);
}

/**
 * Build actual outcomes array from fixtures.
 */
export function buildActualOutcomes(fixtures: Array<{ resultHome: number | null; resultAway: number | null }>): string[] {
  return fixtures.map(f => {
    if (f.resultHome == null || f.resultAway == null) return 'UNKNOWN';
    if (f.resultHome > f.resultAway) return 'HOME';
    if (f.resultAway > f.resultHome) return 'AWAY';
    return 'DRAW';
  });
}
