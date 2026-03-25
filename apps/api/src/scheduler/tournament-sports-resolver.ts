import { prisma } from '../db';
import { getCachedFixtureResults } from '../services/sports/fixture-cache';
import {
  parseMatchdayPrediction,
  determineMatchdayWinner,
  buildActualOutcomes,
  computeTotalGoals,
} from '../services/tournament-sports-scoring';
import { emitTournamentMatchResult } from '../websocket';

// Throttle: check fixture cache max once per 5 minutes per round
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
  sport: string | null;
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
  if (fixtures.length === 0) {
    console.warn(`[Sports Tournament] No fixtures for round ${tournament.currentRound} — cannot resolve. Admin must assign fixtures or resolve manually.`);
    return;
  }

  // Check unfinished fixtures
  const unfinished = fixtures.filter(f => f.status !== 'FINISHED');
  if (unfinished.length > 0) {
    const cacheKey = `${tournament.id}-r${tournament.currentRound}`;
    const last = lastChecked.get(cacheKey) || 0;
    if (Date.now() - last < CHECK_INTERVAL_MS) return;
    lastChecked.set(cacheKey, Date.now());

    // Skip fixtures with manual IDs (admin-created, no real API match)
    const pollable = unfinished.filter(f => !f.footballMatchId.startsWith('manual-'));
    if (pollable.length === 0) {
      console.log(`[Sports Tournament] All unfinished fixtures are manual — waiting for admin to resolve`);
      return;
    }

    // Batch read from fixture cache (0 API calls!)
    const pollableIds = pollable.map(f => f.footballMatchId);
    const resultMap = await getCachedFixtureResults(pollableIds);
    let updated = 0;

    for (const fix of pollable) {
      const result = resultMap.get(fix.footballMatchId);
      if (!result) continue; // Not finished in cache yet

      // Validate result data
      if (typeof result.homeScore !== 'number' || typeof result.awayScore !== 'number') {
        console.warn(`[Sports Tournament] Invalid result data for ${fix.footballMatchId}: homeScore=${result.homeScore} awayScore=${result.awayScore}`);
        continue;
      }
      if (result.homeScore < 0 || result.awayScore < 0) {
        console.warn(`[Sports Tournament] Negative score for ${fix.footballMatchId}: ${result.homeScore}-${result.awayScore}`);
        continue;
      }

      const outcome = result.homeScore > result.awayScore ? 'HOME' : result.awayScore > result.homeScore ? 'AWAY' : 'DRAW';
      await prisma.tournamentRoundFixture.update({
        where: { id: fix.id },
        data: { resultHome: result.homeScore, resultAway: result.awayScore, resultOutcome: outcome, status: 'FINISHED' },
      });
      updated++;
    }

    if (updated > 0) console.log(`[Sports Tournament] Updated ${updated} fixture results`);

    const stillUnfinished = unfinished.length - updated;
    if (stillUnfinished > 0) return; // Wait for next cycle
  }

  // ── 3. All fixtures finished → resolve bracket matches ────────────────
  const freshFixtures = await prisma.tournamentRoundFixture.findMany({
    where: { tournamentId: tournament.id, round: tournament.currentRound },
    orderBy: { fixtureIndex: 'asc' },
  });

  // Final safety check: every fixture must be FINISHED
  if (freshFixtures.some(f => f.status !== 'FINISHED')) return;

  // Validate: every fixture must have valid scores
  for (const f of freshFixtures) {
    if (f.resultHome == null || f.resultAway == null || f.resultOutcome == null) {
      console.error(`[Sports Tournament] Fixture ${f.id} is FINISHED but missing result data — skipping resolution`);
      return;
    }
  }

  const actualOutcomes = buildActualOutcomes(freshFixtures);
  const actualTotalGoals = computeTotalGoals(freshFixtures);
  const resultsJson = JSON.stringify({ outcomes: actualOutcomes, totalGoals: actualTotalGoals });

  console.log(`[Sports Tournament] All ${freshFixtures.length} fixtures finished. Resolving ${activeMatches.length} bracket matches.`);

  for (const match of activeMatches) {
    const p1 = parseMatchdayPrediction(match.player1Prediction);
    const p2 = parseMatchdayPrediction(match.player2Prediction);

    // Validate predictions exist and have correct length
    if (!p1 || !p2) {
      console.error(`[Sports Tournament] Match ${match.id}: corrupt prediction data — p1=${!!p1} p2=${!!p2}. Skipping.`);
      continue;
    }
    if (p1.outcomes.length !== freshFixtures.length || p2.outcomes.length !== freshFixtures.length) {
      console.warn(`[Sports Tournament] Match ${match.id}: prediction length mismatch (p1=${p1.outcomes.length} p2=${p2.outcomes.length} fixtures=${freshFixtures.length}). Scoring with available data.`);
      // Pad with empty strings so scoring counts 0 for missing predictions
      while (p1.outcomes.length < freshFixtures.length) p1.outcomes.push('');
      while (p2.outcomes.length < freshFixtures.length) p2.outcomes.push('');
    }

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
    console.log(`[Sports Tournament] Match ${match.id}: ${p1Score}v${p2Score} → ${winner.slice(0, 8)}`);
  }

  // Cleanup
  lastChecked.delete(`${tournament.id}-r${tournament.currentRound}`);
}
