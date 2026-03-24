import { Router, type Router as RouterType } from 'express';
import {
  createTournament,
  startTournament,
  cancelTournament,
  generateRoundMatches,
} from '../../services/tournament';
import { prisma } from '../../db';
import { getAdapter } from '../../services/sports';

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

// GET /api/admin/tournaments/upcoming-matches?league=CL — fetch upcoming matches from football API
adminTournamentsRouter.get('/upcoming-matches', async (req, res) => {
  try {
    const league = (req.query.league as string) || 'CL';
    const adapter = getAdapter('FOOTBALL');
    const matches = await adapter.fetchUpcomingMatches(league);

    res.json({
      success: true,
      data: matches.map(m => ({
        id: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeTeamCrest: m.homeTeamCrest,
        awayTeamCrest: m.awayTeamCrest,
        kickoff: m.kickoff.toISOString(),
        status: m.status,
      })),
    });
  } catch (error) {
    console.error('[Admin] Fetch upcoming matches error:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch matches' } });
  }
});

// POST /api/admin/tournaments/create — create tournament
adminTournamentsRouter.post('/create', async (req, res) => {
  try {
    const { name, asset, entryFee, size, matchDuration, predictionWindow, scheduledAt, tournamentType, sport, league } = req.body;
    if (!name || !entryFee || !size) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'name, entryFee, size required' } });
    }

    const tournament = await createTournament({
      name,
      asset: asset || (tournamentType === 'SPORTS' ? `${sport || 'FOOTBALL'}:${league || 'ALL'}` : 'BTC'),
      entryFee: BigInt(entryFee),
      size,
      matchDuration: matchDuration || 0,
      predictionWindow,
      scheduledAt,
      tournamentType,
      sport,
      league,
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

    const { name, asset, entryFee, size, matchDuration, predictionWindow, scheduledAt, tournamentType, sport, league } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (asset !== undefined) data.asset = asset;
    if (entryFee !== undefined) data.entryFee = BigInt(entryFee);
    if (size !== undefined) { data.size = size; data.totalRounds = Math.log2(size); }
    if (matchDuration !== undefined) data.matchDuration = matchDuration;
    if (predictionWindow !== undefined) data.predictionWindow = predictionWindow;
    if (scheduledAt !== undefined) data.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    if (tournamentType !== undefined) data.tournamentType = tournamentType;
    if (sport !== undefined) data.sport = sport;
    if (league !== undefined) data.league = league;

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

// POST /api/admin/tournaments/:id/assign-match — set football match for a specific round
adminTournamentsRouter.post('/:id/assign-match', async (req, res) => {
  try {
    const { homeTeam, awayTeam, homeTeamCrest, awayTeamCrest, footballMatchId, round } = req.body;
    if (!homeTeam || !awayTeam) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'homeTeam and awayTeam required' } });
    }
    const tournament = await prisma.tournament.findUniqueOrThrow({ where: { id: req.params.id } });
    const targetRound = round || tournament.currentRound;

    // Allow assigning for REGISTERING (pre-config) or ACTIVE tournaments
    if (tournament.status !== 'ACTIVE' && tournament.status !== 'REGISTERING') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Tournament must be REGISTERING or ACTIVE' } });
    }

    // For REGISTERING: store in matchConfig JSON (matches don't exist yet)
    if (tournament.status === 'REGISTERING') {
      const existing = JSON.parse(tournament.matchConfig || '{}');
      existing[String(targetRound)] = { homeTeam, awayTeam, homeTeamCrest: homeTeamCrest || null, awayTeamCrest: awayTeamCrest || null, footballMatchId: footballMatchId || null };
      await prisma.tournament.update({ where: { id: req.params.id }, data: { matchConfig: JSON.stringify(existing) } });
      console.log(`[Admin] Pre-configured round ${targetRound}: ${homeTeam} vs ${awayTeam}`);
      res.json({ success: true, data: { round: targetRound, homeTeam, awayTeam, preConfigured: true } });
      return;
    }

    const updated = await prisma.tournamentMatch.updateMany({
      where: { tournamentId: tournament.id, round: targetRound },
      data: { homeTeam, awayTeam, homeTeamCrest: homeTeamCrest || null, awayTeamCrest: awayTeamCrest || null, footballMatchId: footballMatchId || `manual-${Date.now()}` },
    });
    console.log(`[Admin] Assigned ${homeTeam} vs ${awayTeam} to round ${targetRound} (${updated.count} matches)`);
    res.json({ success: true, data: { matchesUpdated: updated.count, round: targetRound, homeTeam, awayTeam } });
  } catch (error) {
    console.error('[Admin] Assign match error:', error);
    res.status(400).json({ success: false, error: { code: 'ASSIGN_ERROR', message: error instanceof Error ? error.message : 'Failed' } });
  }
});

// POST /api/admin/tournaments/:id/resolve-match — manually resolve with HOME/DRAW/AWAY
adminTournamentsRouter.post('/:id/resolve-match', async (req, res) => {
  try {
    const { result } = req.body;
    if (!['HOME', 'DRAW', 'AWAY'].includes(result)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_RESULT', message: 'result must be HOME, DRAW, or AWAY' } });
    }
    const tournament = await prisma.tournament.findUniqueOrThrow({ where: { id: req.params.id } });
    if (tournament.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, error: { code: 'NOT_ACTIVE', message: 'Tournament is not active' } });
    }
    const resultMap: Record<string, bigint> = { HOME: 1n, DRAW: 2n, AWAY: 3n };
    const actualResult = resultMap[result];
    const now = new Date();
    const activeMatches = await prisma.tournamentMatch.findMany({
      where: { tournamentId: tournament.id, round: tournament.currentRound, status: 'ACTIVE' },
    });
    if (activeMatches.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'NO_ACTIVE', message: 'No active matches to resolve' } });
    }
    let resolved = 0;
    for (const match of activeMatches) {
      if (!match.player1Prediction || !match.player2Prediction) continue;
      const p1Correct = match.player1Prediction === actualResult;
      const p2Correct = match.player2Prediction === actualResult;
      let winnerWallet: string;
      if (p1Correct && !p2Correct) winnerWallet = match.player1Wallet!;
      else if (p2Correct && !p1Correct) winnerWallet = match.player2Wallet!;
      else winnerWallet = (match.player1PredictedAt! <= match.player2PredictedAt!) ? match.player1Wallet! : match.player2Wallet!;
      await prisma.tournamentMatch.update({
        where: { id: match.id },
        data: { finalPrice: actualResult, winnerWallet, status: 'RESOLVED', resolvedAt: now },
      });
      resolved++;
    }
    console.log(`[Admin] Resolved ${resolved} matches in round ${tournament.currentRound}: ${result}`);
    res.json({ success: true, data: { resolved, result, round: tournament.currentRound } });
  } catch (error) {
    console.error('[Admin] Resolve match error:', error);
    res.status(400).json({ success: false, error: { code: 'RESOLVE_ERROR', message: error instanceof Error ? error.message : 'Failed' } });
  }
});
