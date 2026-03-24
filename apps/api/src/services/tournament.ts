import { prisma } from '../db';
import { generateRoundMatchesTx } from './tournament-bracket';
import { assignMatchdayToRound } from './tournament-sports';

// Re-export everything from tournament-bracket so existing imports keep working
export {
  generateRoundMatches,
  generateRoundMatchesTx,
  submitPrediction,
  checkAndAdvanceRound,
  getTournamentBracket,
  getActiveBanner,
  completeTournament,
} from './tournament-bracket';

const VALID_SIZES = [8, 16, 32];
const DEFAULT_PREDICTION_WINDOW = 300; // 5 minutes fallback

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
  tournamentType?: string;
  sport?: string;
  league?: string;
}) {
  const { name, asset, entryFee, size, matchDuration, predictionWindow, scheduledAt, tournamentType, sport, league } = data;

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
      tournamentType: tournamentType || 'CRYPTO',
      sport: sport || null,
      league: league || null,
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
  const result = await prisma.$transaction(async (tx) => {
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

    return { matches, tournamentType: tournament.tournamentType, league: tournament.league, matchConfig: tournament.matchConfig };
  });

  // For sports tournaments, assign matchday fixtures to round 1
  if (result.tournamentType === 'SPORTS' && result.league) {
    await assignMatchdayToRound(tournamentId, 1, result.league).catch(err =>
      console.error('[Tournament] Failed to assign matchday to round 1:', err)
    );
  }

  return result.matches;
}

// ─── 4. Cancel Tournament ────────────────────────────────────────────────────

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
