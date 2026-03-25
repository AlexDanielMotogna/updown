import { prisma } from '../db';
import { getCachedUpcomingFixtures } from './sports/fixture-cache';

// Re-export scoring utilities for convenience
export {
  parseMatchdayPrediction,
  serializeMatchdayPrediction,
  determineMatchdayWinner,
  scoreOutcomes,
  computeTotalGoals,
  buildActualOutcomes,
  POINTS_PER_CORRECT,
} from './tournament-sports-scoring';
export type { MatchdayPrediction } from './tournament-sports-scoring';

/**
 * Assign all upcoming matchday fixtures to a tournament round.
 * Creates TournamentRoundFixture rows for the next matchday in the league.
 */
export async function assignMatchdayToRound(
  tournamentId: string,
  round: number,
  league: string,
  sport: string = 'FOOTBALL',
): Promise<void> {
  // Check if fixtures already exist for this round
  const existing = await prisma.tournamentRoundFixture.count({
    where: { tournamentId, round },
  });
  if (existing > 0) {
    console.log(`[Sports Tournament] Round ${round} already has ${existing} fixtures, skipping`);
    return;
  }

  const matches = await getCachedUpcomingFixtures(sport, league);

  if (matches.length === 0) {
    console.warn(`[Sports Tournament] No upcoming matches for ${league}`);
    return;
  }

  // Create fixture rows
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    await prisma.tournamentRoundFixture.create({
      data: {
        tournamentId,
        round,
        fixtureIndex: i,
        footballMatchId: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeTeamCrest: m.homeTeamCrest || null,
        awayTeamCrest: m.awayTeamCrest || null,
        kickoff: m.kickoff,
      },
    });
  }

  console.log(`[Sports Tournament] Assigned ${matches.length} fixtures to round ${round} (${league})`);
}

/**
 * Manually assign fixtures to a round from admin-provided data.
 */
export async function assignFixturesToRound(
  tournamentId: string,
  round: number,
  fixtures: Array<{
    footballMatchId: string;
    homeTeam: string;
    awayTeam: string;
    homeTeamCrest?: string | null;
    awayTeamCrest?: string | null;
    kickoff?: string | null;
  }>,
): Promise<number> {
  // Delete existing fixtures for this round
  await prisma.tournamentRoundFixture.deleteMany({
    where: { tournamentId, round },
  });

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    await prisma.tournamentRoundFixture.create({
      data: {
        tournamentId,
        round,
        fixtureIndex: i,
        footballMatchId: f.footballMatchId,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        homeTeamCrest: f.homeTeamCrest || null,
        awayTeamCrest: f.awayTeamCrest || null,
        kickoff: f.kickoff ? new Date(f.kickoff) : null,
      },
    });
  }

  return fixtures.length;
}
