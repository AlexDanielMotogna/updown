import { prisma } from '../db';
import { getAdapter } from '../services/sports';
import {
  parseMatchdayPrediction,
  determineMatchdayWinner,
  buildActualOutcomes,
  computeTotalGoals,
} from '../services/tournament-sports-scoring';
import { emitTournamentMatchResult } from '../websocket';

// Throttle: check fixture results max once per 5 minutes
const lastChecked = new Map<string, number>();
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Process a sports tournament:
 * 1. Handle prediction timeouts (PENDING matches past deadline)
 * 2. Check if all fixtures are finished, then resolve ACTIVE bracket matches
 */
export async function processSportsTournament(tournament: {
  id: string;
  name: string;
  asset: string;
  currentRound: number;
  league: string | null;
}): Promise<void> {
  const now = new Date();

  // ── 1. Handle prediction timeouts ─────────────────────────────────────
  const pendingMatches = await prisma.tournamentMatch.findMany({
    where: { tournamentId: tournament.id, round: tournament.currentRound, status: 'PENDING' },
  });

  for (const match of pendingMatches) {
    if (!match.player1Wallet || !match.player2Wallet) continue;
    if (!match.predictionDeadline || now < match.predictionDeadline) continue;

    const p1Predicted = match.player1Prediction != null;
    const p2Predicted = match.player2Prediction != null;
    let winnerWallet: string | null = null;

    if (p1Predicted && !p2Predicted) {
      winnerWallet = match.player1Wallet;
    } else if (!p1Predicted && p2Predicted) {
      winnerWallet = match.player2Wallet;
    } else if (!p1Predicted && !p2Predicted) {
      winnerWallet = match.player1Wallet;
    } else {
      // Both predicted → move to ACTIVE, wait for all fixtures to finish
      await prisma.tournamentMatch.update({
        where: { id: match.id },
        data: { status: 'ACTIVE', startTime: now },
      });
      console.log(`[Sports Tournament] Match ${match.id}: both predicted, waiting for fixtures`);
      continue;
    }

    await prisma.tournamentMatch.update({
      where: { id: match.id },
      data: { winnerWallet, status: 'RESOLVED', resolvedAt: now },
    });
    emitTournamentMatchResult({
      tournamentId: tournament.id, tournamentName: tournament.name,
      matchId: match.id, round: match.round,
      winnerWallet: winnerWallet!,
      loserWallet: winnerWallet === match.player1Wallet ? match.player2Wallet : match.player1Wallet,
      asset: tournament.asset,
    });
  }

  // ── 2. Check fixtures and resolve ACTIVE matches ──────────────────────
  const activeMatches = await prisma.tournamentMatch.findMany({
    where: { tournamentId: tournament.id, round: tournament.currentRound, status: 'ACTIVE' },
  });
  if (activeMatches.length === 0) return;

  const fixtures = await prisma.tournamentRoundFixture.findMany({
    where: { tournamentId: tournament.id, round: tournament.currentRound },
    orderBy: { fixtureIndex: 'asc' },
  });
  if (fixtures.length === 0) return;

  // Check if we need to poll the football API for unfinished fixtures
  const unfinished = fixtures.filter(f => f.status !== 'FINISHED');
  if (unfinished.length > 0) {
    // Throttle API checks
    const cacheKey = `${tournament.id}-r${tournament.currentRound}`;
    const last = lastChecked.get(cacheKey) || 0;
    if (Date.now() - last < CHECK_INTERVAL_MS) return;
    lastChecked.set(cacheKey, Date.now());

    const adapter = getAdapter('FOOTBALL');
    let updated = 0;
    for (const fix of unfinished) {
      try {
        const result = await adapter.fetchMatchResult(fix.footballMatchId);
        if (!result) continue;
        const outcome = result.homeScore > result.awayScore ? 'HOME' : result.awayScore > result.homeScore ? 'AWAY' : 'DRAW';
        await prisma.tournamentRoundFixture.update({
          where: { id: fix.id },
          data: { resultHome: result.homeScore, resultAway: result.awayScore, resultOutcome: outcome, status: 'FINISHED' },
        });
        updated++;
      } catch (err) {
        console.warn(`[Sports Tournament] Error checking fixture ${fix.footballMatchId}:`, err instanceof Error ? err.message : err);
      }
    }
    if (updated > 0) console.log(`[Sports Tournament] Updated ${updated} fixture results`);

    // Re-check if all finished now
    const stillUnfinished = unfinished.length - updated;
    if (stillUnfinished > 0) {
      console.log(`[Sports Tournament] ${stillUnfinished} fixtures still unfinished, waiting...`);
      return;
    }
  }

  // All fixtures finished → resolve bracket matches
  const freshFixtures = await prisma.tournamentRoundFixture.findMany({
    where: { tournamentId: tournament.id, round: tournament.currentRound },
    orderBy: { fixtureIndex: 'asc' },
  });

  if (freshFixtures.some(f => f.status !== 'FINISHED')) return;

  const actualOutcomes = buildActualOutcomes(freshFixtures);
  const actualTotalGoals = computeTotalGoals(freshFixtures);
  const resultsJson = JSON.stringify({ outcomes: actualOutcomes, totalGoals: actualTotalGoals });

  console.log(`[Sports Tournament] All fixtures finished. Outcomes: ${actualOutcomes.join(',')} Total goals: ${actualTotalGoals}`);

  for (const match of activeMatches) {
    const p1 = parseMatchdayPrediction(match.player1Prediction);
    const p2 = parseMatchdayPrediction(match.player2Prediction);
    if (!p1 || !p2) continue;

    const { winner, p1Score, p2Score } = determineMatchdayWinner(
      { prediction: p1, predictedAt: match.player1PredictedAt!, wallet: match.player1Wallet! },
      { prediction: p2, predictedAt: match.player2PredictedAt!, wallet: match.player2Wallet! },
      actualOutcomes,
      actualTotalGoals,
    );

    await prisma.tournamentMatch.update({
      where: { id: match.id },
      data: { finalPrice: resultsJson, winnerWallet: winner, player1Score: p1Score, player2Score: p2Score, status: 'RESOLVED', resolvedAt: now },
    });

    const loser = winner === match.player1Wallet ? match.player2Wallet : match.player1Wallet;
    emitTournamentMatchResult({
      tournamentId: tournament.id, tournamentName: tournament.name,
      matchId: match.id, round: match.round, winnerWallet: winner, loserWallet: loser, asset: tournament.asset,
    });
    console.log(`[Sports Tournament] Match ${match.id}: p1=${p1Score} p2=${p2Score} → ${winner?.slice(0, 8)}`);
  }

  lastChecked.delete(`${tournament.id}-r${tournament.currentRound}`);
}
