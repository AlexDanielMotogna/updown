import { Router, type Router as RouterType } from 'express';
import {
  createTournament,
  startTournament,
  cancelTournament,
  generateRoundMatches,
} from '../../services/tournament';
import { prisma } from '../../db';

export const adminTournamentsRouter: RouterType = Router();

// GET /api/admin/tournaments — list all tournaments
adminTournamentsRouter.get('/', async (_req, res) => {
  try {
    const tournaments = await prisma.tournament.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { participants: true } } },
    });

    res.json({
      success: true,
      data: tournaments.map(t => ({
        ...t,
        entryFee: t.entryFee.toString(),
        prizePool: t.prizePool.toString(),
      })),
    });
  } catch (error) {
    console.error('[Admin] List tournaments error:', error);
    res.status(500).json({ success: false, error: { code: 'LIST_ERROR', message: 'Failed to list tournaments' } });
  }
});

// POST /api/admin/tournaments/create — create tournament
adminTournamentsRouter.post('/create', async (req, res) => {
  try {
    const { name, asset, entryFee, size, matchDuration, predictionWindow, scheduledAt } = req.body;
    if (!name || !asset || !entryFee || !size || !matchDuration) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'name, asset, entryFee, size, matchDuration required' } });
    }

    const tournament = await createTournament({
      name,
      asset,
      entryFee: BigInt(entryFee),
      size,
      matchDuration,
      predictionWindow,
      scheduledAt,
    });

    res.status(201).json({
      success: true,
      data: {
        ...tournament,
        entryFee: tournament.entryFee.toString(),
        prizePool: tournament.prizePool.toString(),
      },
    });
  } catch (error) {
    console.error('[Admin] Create tournament error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create tournament';
    res.status(400).json({ success: false, error: { code: 'CREATE_ERROR', message } });
  }
});

// POST /api/admin/tournaments/:id/start — start tournament
adminTournamentsRouter.post('/:id/start', async (req, res) => {
  try {
    const matches = await startTournament(req.params.id);
    res.json({
      success: true,
      data: { matches, message: 'Tournament started' },
    });
  } catch (error) {
    console.error('[Admin] Start tournament error:', error);
    const message = error instanceof Error ? error.message : 'Failed to start tournament';
    res.status(400).json({ success: false, error: { code: 'START_ERROR', message } });
  }
});

// POST /api/admin/tournaments/:id/cancel — cancel tournament
adminTournamentsRouter.post('/:id/cancel', async (req, res) => {
  try {
    const result = await cancelTournament(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Admin] Cancel tournament error:', error);
    const message = error instanceof Error ? error.message : 'Failed to cancel tournament';
    res.status(400).json({ success: false, error: { code: 'CANCEL_ERROR', message } });
  }
});

// POST /api/admin/tournaments/:id/reset-round — delete current round matches and recreate them
adminTournamentsRouter.post('/:id/reset-round', async (req, res) => {
  try {
    const tournament = await prisma.tournament.findUniqueOrThrow({
      where: { id: req.params.id },
    });

    if (tournament.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, error: { code: 'NOT_ACTIVE', message: 'Tournament is not active' } });
    }

    const round = tournament.currentRound;

    // Get current matches (with pools to clean up)
    const currentMatches = await prisma.tournamentMatch.findMany({
      where: { tournamentId: tournament.id, round },
    });

    // Determine who plays this round
    let players: string[];
    if (round === 1) {
      const participants = await prisma.tournamentParticipant.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { seed: 'asc' },
      });
      players = participants.map(p => p.walletAddress);
    } else {
      const prevMatches = await prisma.tournamentMatch.findMany({
        where: { tournamentId: tournament.id, round: round - 1 },
      });
      players = prevMatches.filter(m => m.winnerWallet).map(m => m.winnerWallet!);
    }

    // Delete old matches
    await prisma.tournamentMatch.deleteMany({
      where: { tournamentId: tournament.id, round },
    });

    // Recreate matches
    const matches = await generateRoundMatches(tournament.id, round, players);

    console.log(`[Admin] Tournament ${tournament.id} round ${round} reset: ${currentMatches.length} deleted, ${matches.length} created`);

    res.json({
      success: true,
      data: {
        deletedCount: currentMatches.length,
        createdCount: matches.length,
        message: `Round ${round} reset with ${matches.length} matches. Players have 5 minutes to predict.`,
      },
    });
  } catch (error) {
    console.error('[Admin] Reset round error:', error);
    const message = error instanceof Error ? error.message : 'Failed to reset round';
    res.status(500).json({ success: false, error: { code: 'RESET_ERROR', message } });
  }
});

// POST /api/admin/tournaments/:id/update-schedule — update scheduled start time
adminTournamentsRouter.post('/:id/update-schedule', async (req, res) => {
  try {
    const { scheduledAt } = req.body;
    const tournament = await prisma.tournament.update({
      where: { id: req.params.id },
      data: { scheduledAt: scheduledAt ? new Date(scheduledAt) : null },
    });
    res.json({
      success: true,
      data: { ...tournament, entryFee: tournament.entryFee.toString(), prizePool: tournament.prizePool.toString() },
    });
  } catch (error) {
    console.error('[Admin] Update schedule error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update schedule';
    res.status(400).json({ success: false, error: { code: 'UPDATE_ERROR', message } });
  }
});

// POST /api/admin/tournaments/:id/update — update tournament fields (only while REGISTERING)
adminTournamentsRouter.post('/:id/update', async (req, res) => {
  try {
    const existing = await prisma.tournament.findUniqueOrThrow({ where: { id: req.params.id } });
    if (existing.status !== 'REGISTERING') {
      return res.status(400).json({ success: false, error: { code: 'NOT_REGISTERING', message: 'Can only edit tournaments in REGISTERING status' } });
    }

    const { name, asset, entryFee, size, matchDuration, predictionWindow, scheduledAt } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (asset !== undefined) data.asset = asset;
    if (entryFee !== undefined) data.entryFee = BigInt(entryFee);
    if (size !== undefined) { data.size = size; data.totalRounds = Math.log2(size); }
    if (matchDuration !== undefined) data.matchDuration = matchDuration;
    if (predictionWindow !== undefined) data.predictionWindow = predictionWindow;
    if (scheduledAt !== undefined) data.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;

    const tournament = await prisma.tournament.update({ where: { id: req.params.id }, data });
    res.json({
      success: true,
      data: { ...tournament, entryFee: tournament.entryFee.toString(), prizePool: tournament.prizePool.toString() },
    });
  } catch (error) {
    console.error('[Admin] Update tournament error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update tournament';
    res.status(400).json({ success: false, error: { code: 'UPDATE_ERROR', message } });
  }
});
