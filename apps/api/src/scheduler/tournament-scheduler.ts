import cron from 'node-cron';
import { PacificaProvider } from 'market-data';
import { prisma } from '../db';
import { checkAndAdvanceRound } from '../services/tournament';
import { emitTournamentMatchResult } from '../websocket';

const priceProvider = new PacificaProvider();

/** BigInt absolute value. */
function absBI(n: bigint): bigint {
  return n < 0n ? -n : n;
}

/**
 * Process all ACTIVE tournaments:
 * 1. Handle prediction timeouts (PENDING matches past deadline)
 * 2. Resolve ACTIVE matches whose endTime has passed
 * 3. Advance rounds
 */
async function processTournaments(): Promise<void> {
  const tournaments = await prisma.tournament.findMany({ where: { status: 'ACTIVE' } });

  for (const tournament of tournaments) {
    try {
      const now = new Date();

      // ── 1. Handle prediction deadline timeouts ──────────────────────────
      const pendingMatches = await prisma.tournamentMatch.findMany({
        where: {
          tournamentId: tournament.id,
          round: tournament.currentRound,
          status: 'PENDING',
        },
      });

      for (const match of pendingMatches) {
        // Skip BYE
        if (!match.player1Wallet || !match.player2Wallet) continue;

        // Not past deadline yet
        if (!match.predictionDeadline || now < match.predictionDeadline) continue;

        // Deadline expired — determine winner based on who predicted
        const p1Predicted = match.player1Prediction != null;
        const p2Predicted = match.player2Prediction != null;

        let winnerWallet: string | null = null;

        if (p1Predicted && !p2Predicted) {
          // Player 2 didn't predict → auto-lose
          winnerWallet = match.player1Wallet;
          console.log(`[Tournament] Match ${match.id}: player2 timed out, player1 wins`);
        } else if (!p1Predicted && p2Predicted) {
          // Player 1 didn't predict → auto-lose
          winnerWallet = match.player2Wallet;
          console.log(`[Tournament] Match ${match.id}: player1 timed out, player2 wins`);
        } else if (!p1Predicted && !p2Predicted) {
          // Neither predicted → player1 wins by default
          winnerWallet = match.player1Wallet;
          console.log(`[Tournament] Match ${match.id}: neither predicted, player1 wins by default`);
        } else {
          // Both predicted — prediction window ended, start the match
          try {
            const priceTick = await priceProvider.getSpotPrice(tournament.asset);
            await prisma.tournamentMatch.update({
              where: { id: match.id },
              data: {
                strikePrice: priceTick.price,
                startTime: now,
                endTime: new Date(now.getTime() + tournament.matchDuration * 1000),
                status: 'ACTIVE',
              },
            });
            console.log(`[Tournament] Match ${match.id}: prediction window closed, match started (${tournament.matchDuration}s)`);
          } catch (err) {
            console.error(`[Tournament] Failed to start match ${match.id}:`, err instanceof Error ? err.message : err);
          }
          continue;
        }

        await prisma.tournamentMatch.update({
          where: { id: match.id },
          data: { winnerWallet, status: 'RESOLVED', resolvedAt: now },
        });

        const loserWallet = winnerWallet === match.player1Wallet ? match.player2Wallet : match.player1Wallet;
        emitTournamentMatchResult({
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          matchId: match.id,
          round: match.round,
          winnerWallet: winnerWallet!,
          loserWallet,
          asset: tournament.asset,
        });
      }

      // ── 2. Resolve ACTIVE matches past endTime ─────────────────────────
      const activeMatches = await prisma.tournamentMatch.findMany({
        where: {
          tournamentId: tournament.id,
          round: tournament.currentRound,
          status: 'ACTIVE',
          endTime: { not: null },
        },
      });

      for (const match of activeMatches) {
        if (!match.endTime || now < match.endTime) continue;

        try {
          const priceTick = await priceProvider.getSpotPrice(tournament.asset);
          const finalPrice = priceTick.price;

          const p1Pred = match.player1Prediction;
          const p2Pred = match.player2Prediction;

          if (p1Pred === null || p2Pred === null) {
            console.error(`[Tournament] Match ${match.id}: missing prediction(s) in ACTIVE match`);
            continue;
          }

          const d1 = absBI(p1Pred - finalPrice);
          const d2 = absBI(p2Pred - finalPrice);

          let winnerWallet: string | null;

          if (d1 < d2) {
            winnerWallet = match.player1Wallet;
          } else if (d2 < d1) {
            winnerWallet = match.player2Wallet;
          } else {
            // Exact tie — whoever predicted first wins
            const t1 = match.player1PredictedAt?.getTime() ?? Infinity;
            const t2 = match.player2PredictedAt?.getTime() ?? Infinity;
            winnerWallet = t1 <= t2 ? match.player1Wallet : match.player2Wallet;
          }

          await prisma.tournamentMatch.update({
            where: { id: match.id },
            data: { finalPrice, winnerWallet, status: 'RESOLVED', resolvedAt: now },
          });

          const loser = winnerWallet === match.player1Wallet ? match.player2Wallet : match.player1Wallet;
          emitTournamentMatchResult({
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            matchId: match.id,
            round: match.round,
            winnerWallet: winnerWallet!,
            loserWallet: loser,
            asset: tournament.asset,
          });

          console.log(
            `[Tournament] Match ${match.id} resolved: ` +
            `p1=${p1Pred} p2=${p2Pred} final=${finalPrice} ` +
            `d1=${d1} d2=${d2} → ${winnerWallet?.slice(0, 8)}`,
          );
        } catch (err) {
          console.error(`[Tournament] Failed to resolve match ${match.id}:`, err instanceof Error ? err.message : err);
        }
      }

      // ── 3. Advance round ───────────────────────────────────────────────
      await checkAndAdvanceRound(tournament.id);
    } catch (err) {
      console.error(`[Tournament] Error processing tournament ${tournament.id}:`, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Start the tournament scheduler — runs every 5 seconds.
 */
export function startTournamentScheduler(): void {
  console.log('[Tournament] Starting tournament scheduler (every 5s)');
  cron.schedule('*/5 * * * * *', async () => {
    try {
      await processTournaments();
    } catch (err) {
      console.error('[Tournament] Scheduler error:', err instanceof Error ? err.message : err);
    }
  });
}
