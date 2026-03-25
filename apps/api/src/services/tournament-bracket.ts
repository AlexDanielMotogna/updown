import { prisma } from '../db';
import { emitTournamentMatchResult } from '../websocket';

const DEFAULT_PREDICTION_WINDOW = 300; // 5 minutes fallback

// ─── Generate Round Matches (transaction-aware) ─────────────────────────────

/**
 * Internal version that accepts a Prisma transaction client.
 */
export async function generateRoundMatchesTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  tournamentId: string,
  round: number,
  players: string[],
  predictionWindowSeconds?: number,
) {
  const matches = [];

  for (let i = 0; i < players.length; i += 2) {
    const matchIndex = Math.floor(i / 2);

    // Safety: odd player count → BYE
    if (i + 1 >= players.length) {
      const match = await tx.tournamentMatch.create({
        data: {
          tournamentId,
          round,
          matchIndex,
          player1Wallet: players[i],
          player2Wallet: null,
          winnerWallet: players[i],
          status: 'BYE',
        },
      });
      matches.push(match);
      continue;
    }

    const match = await tx.tournamentMatch.create({
      data: {
        tournamentId,
        round,
        matchIndex,
        player1Wallet: players[i],
        player2Wallet: players[i + 1],
        predictionDeadline: new Date(Date.now() + (predictionWindowSeconds || DEFAULT_PREDICTION_WINDOW) * 1000),
        status: 'PENDING',
      },
    });
    matches.push(match);
  }

  return matches;
}

/**
 * Public version that wraps in its own transaction.
 */
export async function generateRoundMatches(
  tournamentId: string,
  round: number,
  players: string[],
  predictionWindowSeconds?: number,
) {
  return prisma.$transaction(async (tx) => {
    return generateRoundMatchesTx(tx, tournamentId, round, players, predictionWindowSeconds);
  });
}

// ─── Submit Prediction ──────────────────────────────────────────────────────

/**
 * Submit prediction for a bracket match.
 * Crypto: prediction is a stringified BigInt (price).
 * Sports: prediction is a JSON string {outcomes: string[], totalGoals: number}.
 */
export async function submitPrediction(
  matchId: string,
  walletAddress: string,
  prediction: string,
  totalGoals?: number,
) {
  return prisma.$transaction(async (tx) => {
    const match = await tx.tournamentMatch.findUniqueOrThrow({
      where: { id: matchId },
      include: { tournament: true },
    });

    if (match.status !== 'PENDING') {
      throw new Error('Match is not accepting predictions');
    }

    if (match.predictionDeadline && new Date() > match.predictionDeadline) {
      throw new Error('Prediction deadline has passed');
    }

    const isPlayer1 = match.player1Wallet === walletAddress;
    const isPlayer2 = match.player2Wallet === walletAddress;

    if (!isPlayer1 && !isPlayer2) {
      throw new Error('Wallet is not a participant in this match');
    }

    if (isPlayer1 && match.player1Prediction != null) {
      throw new Error('Prediction already submitted');
    }
    if (isPlayer2 && match.player2Prediction != null) {
      throw new Error('Prediction already submitted');
    }

    const now = new Date();
    const updateData: Record<string, unknown> = isPlayer1
      ? { player1Prediction: prediction, player1PredictedAt: now, ...(totalGoals != null && { player1TotalGoals: totalGoals }) }
      : { player2Prediction: prediction, player2PredictedAt: now, ...(totalGoals != null && { player2TotalGoals: totalGoals }) };

    const updated = await tx.tournamentMatch.update({
      where: { id: matchId },
      data: updateData,
    });

    return { match: updated, started: false };
  });
}

// ─── Check and Advance Round ────────────────────────────────────────────────

export async function checkAndAdvanceRound(tournamentId: string) {
  return prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
    });

    if (tournament.status !== 'ACTIVE') {
      throw new Error('Tournament is not active');
    }

    const currentRound = tournament.currentRound;

    // Get all matches in the current round
    const matches = await tx.tournamentMatch.findMany({
      where: { tournamentId, round: currentRound },
      orderBy: { matchIndex: 'asc' },
    });

    // No matches for this round — nothing to do
    if (matches.length === 0) {
      return { advanced: false, completed: false };
    }

    // Check if all matches are resolved or BYE
    const allDone = matches.every(
      (m) => m.status === 'RESOLVED' || m.status === 'BYE',
    );

    if (!allDone) {
      return { advanced: false, completed: false };
    }

    // Collect winners
    const winners = matches.map((m) => {
      if (!m.winnerWallet) {
        throw new Error(`Match ${m.id} is resolved but has no winner`);
      }
      return m.winnerWallet;
    });

    // Mark losers as eliminated
    for (const match of matches) {
      if (match.status === 'BYE') continue;
      const loserWallet =
        match.winnerWallet === match.player1Wallet
          ? match.player2Wallet
          : match.player1Wallet;
      if (loserWallet) {
        await tx.tournamentParticipant.updateMany({
          where: { tournamentId, walletAddress: loserWallet },
          data: { eliminatedRound: currentRound },
        });
      }
    }

    // Tournament complete — only 1 winner left
    if (winners.length === 1) {
      await tx.tournament.update({
        where: { id: tournamentId },
        data: {
          status: 'COMPLETED',
          winnerWallet: winners[0],
          completedAt: new Date(),
        },
      });

      // Emit tournament winner event (outside tx, fire-and-forget)
      setTimeout(() => {
        emitTournamentMatchResult({
          tournamentId,
          tournamentName: tournament.name,
          matchId: '',
          round: currentRound,
          winnerWallet: winners[0],
          loserWallet: null,
          asset: tournament.asset,
          completed: true,
          prizePool: tournament.prizePool.toString(),
        });
      }, 0);

      return { advanced: true, completed: true };
    }

    // Advance to next round
    const nextRound = currentRound + 1;

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { currentRound: nextRound },
    });

    await generateRoundMatchesTx(tx, tournamentId, nextRound, winners, tournament.predictionWindow);

    return { advanced: true, completed: false, nextRound, tournamentType: tournament.tournamentType, league: tournament.league, sport: tournament.sport };
  });
}

// ─── Get Tournament Bracket ─────────────────────────────────────────────────

export async function getTournamentBracket(tournamentId: string) {
  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
  });

  const [participants, matches, fixtureRows] = await Promise.all([
    prisma.tournamentParticipant.findMany({
      where: { tournamentId },
      orderBy: { seed: 'asc' },
    }),
    prisma.tournamentMatch.findMany({
      where: { tournamentId },
      orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
    }),
    prisma.tournamentRoundFixture.findMany({
      where: { tournamentId },
      orderBy: [{ round: 'asc' }, { fixtureIndex: 'asc' }],
    }),
  ]);

  // Group matches by round
  const rounds: Record<number, typeof matches> = {};
  for (const match of matches) {
    if (!rounds[match.round]) rounds[match.round] = [];
    rounds[match.round].push(match);
  }

  // Group fixtures by round
  const fixtures: Record<number, typeof fixtureRows> = {};
  for (const f of fixtureRows) {
    if (!fixtures[f.round]) fixtures[f.round] = [];
    fixtures[f.round].push(f);
  }

  return {
    tournament,
    participants,
    rounds,
    fixtures,
  };
}

// ─── Get Active Banner ──────────────────────────────────────────────────────

export async function getActiveBanner() {
  const t = await prisma.tournament.findFirst({
    where: { status: { in: ['REGISTERING', 'ACTIVE'] } },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { participants: true } } },
  });
  if (!t) return null;
  return { ...t, participantCount: t._count.participants, _count: undefined };
}

// ─── Complete Tournament (payout calculation) ────────────────────────────────

const PLATFORM_FEE_BPS = 500; // 5%

export async function completeTournament(tournamentId: string) {
  const tournament = await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });

  const prizePool = tournament.prizePool;
  const feeAmount = (prizePool * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
  const prizeAmount = prizePool - feeAmount;

  return {
    winnerWallet: tournament.winnerWallet,
    prizeAmount,
    feeAmount,
  };
}
