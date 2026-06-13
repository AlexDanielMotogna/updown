import { prisma } from '../db';
import { getCachedFixtureResults } from '../services/sports/fixture-cache';
import { getAdapterForLeague } from './sports-shared';
import { resolveMatchPools } from './sports-pool-resolution';

/**
 * Safety net: force-check all overdue pools (kickoff >3h ago, still unresolved).
 * Bypasses the normal API_LOOKUP_LIMIT since these are clearly stuck.
 * Runs every 15 minutes.
 */
export async function sweepUnresolvedPools(): Promise<void> {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const overdue = await prisma.pool.findMany({
    where: {
      poolType: 'SPORTS',
      status: { in: ['ACTIVE', 'JOINING'] },
      matchId: { not: null },
      startTime: { lte: threeHoursAgo },
    },
  });

  if (overdue.length === 0) return;

  console.warn(`[Sports] SWEEP: ${overdue.length} overdue pool(s) - force-checking all APIs`);
  const matchIds = [...new Set(overdue.map(p => p.matchId!).filter(Boolean))];
  const resultMap = await getCachedFixtureResults(matchIds);

  for (const pool of overdue) {
    if (!pool.matchId) continue;
    const result = resultMap.get(pool.matchId);
    if (!result) {
      console.warn(`[Sports] SWEEP: ${pool.matchId} (${pool.homeTeam} vs ${pool.awayTeam}) - still no result after 3h+`);
      continue;
    }

    try {
      const adapter = getAdapterForLeague(pool.league);
      const winnerSide = adapter.resolveWinner(result);

      await prisma.pool.update({
        where: { id: pool.id },
        data: { homeScore: result.homeScore, awayScore: result.awayScore },
      });

      const betCount = await prisma.bet.count({ where: { poolId: pool.id } });
      console.log(`[Sports] SWEEP: Resolving ${pool.homeTeam} vs ${pool.awayTeam} (${result.homeScore}-${result.awayScore}, ${betCount} bets)`);

      // Delegate to the normal resolver (same logic)
      await resolveMatchPools();
      return; // Let the normal resolver handle all remaining
    } catch (error) {
      console.error(`[Sports] SWEEP: Failed to resolve ${pool.id}:`, error);
    }
  }
}
