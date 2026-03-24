import { prisma } from '../db';
import { getAdapter } from '../services/sports';
import { determineSportsWinner, encodeMatchResult, assignMatchToRound } from '../services/tournament-sports';
import { emitTournamentMatchResult } from '../websocket';

// Cache: avoid hitting football API more than once per 5 minutes per match
const lastChecked = new Map<string, number>();
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Process sports tournament matches:
 * 1. Handle prediction timeouts (same as crypto — auto-advance)
 * 2. For ACTIVE matches, check if the real football match is finished (max once per 5min)
 */
export async function processSportsTournament(tournament: {
  id: string;
  name: string;
  asset: string;
  currentRound: number;
  matchDuration: number;
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
      winnerWallet = match.player1Wallet; // default
    } else {
      // Both predicted — move to ACTIVE, wait for real match result
      await prisma.tournamentMatch.update({
        where: { id: match.id },
        data: { status: 'ACTIVE', startTime: now },
      });
      console.log(`[Sports Tournament] Match ${match.id}: both predicted, waiting for football result`);

      // Assign football match if not already assigned
      if (!match.footballMatchId && tournament.league) {
        await assignMatchToRound(tournament.id, tournament.currentRound, tournament.league);
      }
      continue;
    }

    await prisma.tournamentMatch.update({
      where: { id: match.id },
      data: { winnerWallet, status: 'RESOLVED', resolvedAt: now },
    });

    emitTournamentMatchResult({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      matchId: match.id,
      round: match.round,
      winnerWallet: winnerWallet!,
      loserWallet: winnerWallet === match.player1Wallet ? match.player2Wallet : match.player1Wallet,
      asset: tournament.asset,
    });
  }

  // ── 2. Resolve ACTIVE matches — check real football result (throttled) ─
  const activeMatches = await prisma.tournamentMatch.findMany({
    where: { tournamentId: tournament.id, round: tournament.currentRound, status: 'ACTIVE' },
  });

  if (activeMatches.length === 0) return;

  // All matches in the same round share the same footballMatchId — only check API once
  const footballMatchId = activeMatches.find(m => m.footballMatchId)?.footballMatchId;
  if (!footballMatchId) return;

  // Throttle: only check once every 5 minutes per footballMatchId
  const lastCheck = lastChecked.get(footballMatchId) || 0;
  if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
  lastChecked.set(footballMatchId, Date.now());

  const adapter = getAdapter('FOOTBALL');
  let result;
  try {
    result = await adapter.fetchMatchResult(footballMatchId);
  } catch (err) {
    console.warn(`[Sports Tournament] API error checking match ${footballMatchId}:`, err instanceof Error ? err.message : err);
    return;
  }

  if (!result) {
    console.log(`[Sports Tournament] Match ${footballMatchId} not finished yet, will check again in 5min`);
    return;
  }

  // Match finished — resolve all bracket matches in this round
  const actualResult = encodeMatchResult(result.homeScore, result.awayScore);
  console.log(`[Sports Tournament] Football match ${footballMatchId} finished: ${result.homeScore}-${result.awayScore}`);

  for (const match of activeMatches) {
    if (match.player1Prediction == null || match.player2Prediction == null) continue;

    const winnerWallet = determineSportsWinner(
      match.player1Prediction,
      match.player2Prediction,
      actualResult,
      match.player1PredictedAt!,
      match.player2PredictedAt!,
      match.player1Wallet!,
      match.player2Wallet!,
    );

    await prisma.tournamentMatch.update({
      where: { id: match.id },
      data: { finalPrice: actualResult, winnerWallet, status: 'RESOLVED', resolvedAt: now },
    });

    const loser = winnerWallet === match.player1Wallet ? match.player2Wallet : match.player1Wallet;
    emitTournamentMatchResult({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      matchId: match.id,
      round: match.round,
      winnerWallet,
      loserWallet: loser,
      asset: tournament.asset,
    });

    console.log(`[Sports Tournament] Bracket match ${match.id} resolved → ${winnerWallet?.slice(0, 8)}`);
  }

  // Clean up cache entry
  lastChecked.delete(footballMatchId);
}
