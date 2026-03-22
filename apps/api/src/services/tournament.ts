import { PacificaProvider } from 'market-data';
import { prisma } from '../db';
import { emitTournamentMatchResult } from '../websocket';

const VALID_SIZES = [8, 16, 32];
const PLATFORM_FEE_BPS = 500; // 5%
const DEFAULT_PREDICTION_WINDOW = 300; // 5 minutes fallback

const priceProvider = new PacificaProvider();

// ─── Fisher-Yates shuffle ────────────────────────────────────────────────────

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── 1. Create Tournament ────────────────────────────────────────────────────

export async function createTournament(data: {
  name: string;
  asset: string;
  entryFee: bigint;
  size: number;
  matchDuration: number;
  predictionWindow?: number;
  scheduledAt?: string;
}) {
  const { name, asset, entryFee, size, matchDuration, predictionWindow, scheduledAt } = data;

  if (!VALID_SIZES.includes(size)) {
    throw new Error(`Invalid tournament size: ${size}. Must be one of ${VALID_SIZES.join(', ')}`);
  }

  const totalRounds = Math.log2(size);

  return prisma.tournament.create({
    data: {
      name,
      asset,
      entryFee,
      size,
      matchDuration,
      predictionWindow: predictionWindow || DEFAULT_PREDICTION_WINDOW,
      totalRounds,
      status: 'REGISTERING',
      currentRound: 0,
      prizePool: BigInt(0),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    },
  });
}

// ─── 2. Register Participant ─────────────────────────────────────────────────

export async function registerParticipant(
  tournamentId: string,
  walletAddress: string,
  depositTx: string,
) {
  return prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
    });

    if (tournament.status !== 'REGISTERING') {
      throw new Error('Tournament is not accepting registrations');
    }

    // Check duplicate
    const existing = await tx.tournamentParticipant.findUnique({
      where: {
        tournamentId_walletAddress: { tournamentId, walletAddress },
      },
    });
    if (existing) {
      throw new Error('Wallet already registered for this tournament');
    }

    // Check slots
    const count = await tx.tournamentParticipant.count({
      where: { tournamentId },
    });
    if (count >= tournament.size) {
      throw new Error('Tournament is full');
    }

    const seed = count + 1;

    const participant = await tx.tournamentParticipant.create({
      data: {
        tournamentId,
        walletAddress,
        seed,
        depositTx,
      },
    });

    // Increment prize pool
    await tx.tournament.update({
      where: { id: tournamentId },
      data: {
        prizePool: { increment: tournament.entryFee },
      },
    });

    return participant;
  });
}

// ─── 3. Start Tournament ─────────────────────────────────────────────────────

export async function startTournament(tournamentId: string) {
  return prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
    });

    if (tournament.status !== 'REGISTERING') {
      throw new Error('Tournament is not in REGISTERING status');
    }

    const participants = await tx.tournamentParticipant.findMany({
      where: { tournamentId },
    });

    if (participants.length < tournament.size) {
      throw new Error(
        `Not enough participants: ${participants.length}/${tournament.size}`,
      );
    }

    // Fisher-Yates shuffle for random seeding
    const shuffled = shuffle(participants);

    // Reassign seeds based on shuffled order
    for (let i = 0; i < shuffled.length; i++) {
      await tx.tournamentParticipant.update({
        where: { id: shuffled[i].id },
        data: { seed: i + 1 },
      });
    }

    // Update tournament status
    await tx.tournament.update({
      where: { id: tournamentId },
      data: {
        status: 'ACTIVE',
        currentRound: 1,
        startedAt: new Date(),
      },
    });

    // Generate first round matches
    const playerWallets = shuffled.map((p) => p.walletAddress);
    const matches = await generateRoundMatchesTx(tx, tournamentId, 1, playerWallets, tournament.predictionWindow);

    return matches;
  });
}

// ─── 4. Generate Round Matches ───────────────────────────────────────────────

/**
 * Internal version that accepts a Prisma transaction client.
 */
async function generateRoundMatchesTx(
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

// ─── 5. Submit Prediction ────────────────────────────────────────────────────

export async function submitPrediction(
  matchId: string,
  walletAddress: string,
  prediction: bigint,
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

    if (prediction <= 0n) {
      throw new Error('Prediction must be positive');
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
      ? { player1Prediction: prediction, player1PredictedAt: now }
      : { player2Prediction: prediction, player2PredictedAt: now };

    // Prediction locked. Scheduler starts the match when prediction window ends.
    const updated = await tx.tournamentMatch.update({
      where: { id: matchId },
      data: updateData,
    });

    return { match: updated, started: false };
  });
}

// ─── Check and Advance Round ─────────────────────────────────────────────────

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

    return { advanced: true, completed: false };
  });
}

// ─── 6. Complete Tournament (payout calculation) ─────────────────────────────

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

// ─── 7. Cancel Tournament ────────────────────────────────────────────────────

export async function cancelTournament(tournamentId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.tournament.update({
      where: { id: tournamentId },
      data: { status: 'CANCELLED' },
    });

    const participants = await tx.tournamentParticipant.findMany({
      where: { tournamentId },
    });

    return participants;
  });
}

// ─── 8. Get Tournament Bracket ───────────────────────────────────────────────

export async function getTournamentBracket(tournamentId: string) {
  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
  });

  const [participants, matches] = await Promise.all([
    prisma.tournamentParticipant.findMany({
      where: { tournamentId },
      orderBy: { seed: 'asc' },
    }),
    prisma.tournamentMatch.findMany({
      where: { tournamentId },
      orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
    }),
  ]);

  // Group matches by round
  const rounds: Record<number, typeof matches> = {};
  for (const match of matches) {
    if (!rounds[match.round]) {
      rounds[match.round] = [];
    }
    rounds[match.round].push(match);
  }

  return {
    tournament,
    participants,
    rounds,
  };
}

// ─── 9. Get Active Banner ────────────────────────────────────────────────────

export async function getActiveBanner() {
  const t = await prisma.tournament.findFirst({
    where: { status: { in: ['REGISTERING', 'ACTIVE'] } },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { participants: true } } },
  });
  if (!t) return null;
  return { ...t, participantCount: t._count.participants, _count: undefined };
}
