import { Router, type Router as RouterType } from 'express';
import {
  createTournament,
  startTournament,
  cancelTournament,
  generateRoundMatchesTx,
} from '../../services/tournament';
import { prisma } from '../../db';
import { getCachedUpcomingFixtures } from '../../services/sports/fixture-cache';
import { assignFixturesToRound } from '../../services/tournament-sports';
import { buildActualOutcomes, computeTotalGoals, determineMatchdayWinner, parseMatchdayPrediction } from '../../services/tournament-sports-scoring';

export const adminTournamentsRouter: RouterType = Router();

// GET /api/admin/tournaments - list all tournaments
adminTournamentsRouter.get('/', async (_req, res) => {
  try {
    const tournaments = await prisma.tournament.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { participants: true } },
        fixtures: { orderBy: [{ round: 'asc' }, { fixtureIndex: 'asc' }] },
      },
    });

    res.json({
      success: true,
      data: tournaments.map(t => {
        // Group fixtures by round
        const fixturesByRound: Record<number, Array<{ footballMatchId: string; homeTeam: string; awayTeam: string; fixtureIndex: number; status: string }>> = {};
        for (const f of t.fixtures) {
          if (!fixturesByRound[f.round]) fixturesByRound[f.round] = [];
          fixturesByRound[f.round].push({ footballMatchId: f.footballMatchId, homeTeam: f.homeTeam, awayTeam: f.awayTeam, fixtureIndex: f.fixtureIndex, status: f.status });
        }
        return {
          ...t,
          entryFee: t.entryFee.toString(),
          prizePool: t.prizePool.toString(),
          fixtures: undefined,
          fixturesByRound,
        };
      }),
    });
  } catch (error) {
    console.error('[Admin] List tournaments error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Failed to list tournaments' } });
  }
});

// GET /api/admin/tournaments/upcoming-matches?league=CL&sport=FOOTBALL - fetch upcoming matches
adminTournamentsRouter.get('/upcoming-matches', async (req, res) => {
  try {
    const league = (req.query.league as string) || 'CL';
    const sport = (req.query.sport as string) || 'FOOTBALL';
    const matches = await getCachedUpcomingFixtures(sport, league);

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
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'Failed to fetch matches' } });
  }
});

// POST /api/admin/tournaments/create - create tournament
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
    // 500 on createTournament throws — those are internal/storage failures.
    // Explicit 400 cases (missing fields, invalid size) are already handled
    // above before reaching the service. Phase 5 §HTTP status codes.
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message } });
  }
});

// POST /api/admin/tournaments/:id/start - start tournament
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
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message } });
  }
});

// POST /api/admin/tournaments/:id/cancel - cancel tournament
adminTournamentsRouter.post('/:id/cancel', async (req, res) => {
  try {
    const result = await cancelTournament(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Admin] Cancel tournament error:', error);
    const message = error instanceof Error ? error.message : 'Failed to cancel tournament';
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message } });
  }
});

// POST /api/admin/tournaments/:id/delete - permanently delete a tournament and all related data
adminTournamentsRouter.post('/:id/delete', async (req, res) => {
  try {
    const id = req.params.id;
    const tournament = await prisma.tournament.findUniqueOrThrow({ where: { id } });

    // All-or-nothing delete. Previous version chained four awaits with no
    // transaction — if any step crashed (e.g. an FK violation from a row
    // added between findUniqueOrThrow and the delete) the tournament was
    // left half-deleted (orphan fixtures + matches, no parent tournament).
    // See PLAN-ADMIN-REFACTOR.md Phase 1 #6.
    await prisma.$transaction([
      prisma.tournamentRoundFixture.deleteMany({ where: { tournamentId: id } }),
      prisma.tournamentMatch.deleteMany({ where: { tournamentId: id } }),
      prisma.tournamentParticipant.deleteMany({ where: { tournamentId: id } }),
      prisma.tournament.delete({ where: { id } }),
    ]);

    console.log(`[Admin] Deleted tournament ${id} (${tournament.name})`);
    res.json({ success: true, data: { message: `Tournament "${tournament.name}" deleted` } });
  } catch (error) {
    console.error('[Admin] Delete tournament error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete tournament';
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message } });
  }
});

// POST /api/admin/tournaments/:id/reset-round - delete current round matches and recreate them
adminTournamentsRouter.post('/:id/reset-round', async (req, res) => {
  try {
    const tournament = await prisma.tournament.findUniqueOrThrow({
      where: { id: req.params.id },
    });

    if (tournament.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, error: { code: 'NOT_ACTIVE', message: 'Tournament is not active' } });
    }

    const round = tournament.currentRound;

    // Reset = destructive delete + recreate. Previous version awaited the
    // deleteMany and the generateRoundMatches() call sequentially with no
    // shared transaction — if generateRoundMatches threw (FK error, RPC
    // hiccup) the round's matches were gone with nothing replacing them,
    // permanently bricking the tournament. Now both run inside one
    // $transaction so a failure rolls the delete back.
    // See PLAN-ADMIN-REFACTOR.md Phase 1 #6.
    const { currentMatches, matches } = await prisma.$transaction(async (tx) => {
      const before = await tx.tournamentMatch.findMany({
        where: { tournamentId: tournament.id, round },
      });

      let players: string[];
      if (round === 1) {
        const participants = await tx.tournamentParticipant.findMany({
          where: { tournamentId: tournament.id },
          orderBy: { seed: 'asc' },
        });
        players = participants.map(p => p.walletAddress);
      } else {
        const prevMatches = await tx.tournamentMatch.findMany({
          where: { tournamentId: tournament.id, round: round - 1 },
        });
        players = prevMatches.filter(m => m.winnerWallet).map(m => m.winnerWallet!);
      }

      await tx.tournamentMatch.deleteMany({
        where: { tournamentId: tournament.id, round },
      });

      const created = await generateRoundMatchesTx(tx, tournament.id, round, players, tournament.predictionWindow);
      return { currentMatches: before, matches: created };
    });

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
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message } });
  }
});

// POST /api/admin/tournaments/:id/update - update tournament fields (only while REGISTERING)
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
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message } });
  }
});

// POST /api/admin/tournaments/:id/assign-matchday - assign fixtures to a round
adminTournamentsRouter.post('/:id/assign-matchday', async (req, res) => {
  try {
    const { round, fixtures } = req.body;
    if (!fixtures || !Array.isArray(fixtures) || fixtures.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'fixtures array required' } });
    }
    const tournament = await prisma.tournament.findUniqueOrThrow({ where: { id: req.params.id } });
    const targetRound = round || tournament.currentRound || 1;

    if (tournament.status !== 'ACTIVE' && tournament.status !== 'REGISTERING') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Tournament must be REGISTERING or ACTIVE' } });
    }

    const count = await assignFixturesToRound(tournament.id, targetRound, fixtures);
    console.log(`[Admin] Assigned ${count} fixtures to round ${targetRound}`);
    res.json({ success: true, data: { fixturesAssigned: count, round: targetRound } });
  } catch (error) {
    console.error('[Admin] Assign matchday error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'Failed' } });
  }
});

// POST /api/admin/tournaments/:id/resolve-matchday - manually set fixture results and resolve
adminTournamentsRouter.post('/:id/resolve-matchday', async (req, res) => {
  try {
    const { results } = req.body; // Array of { fixtureIndex, resultHome, resultAway }
    if (!results || !Array.isArray(results)) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'results array required' } });
    }
    const tournament = await prisma.tournament.findUniqueOrThrow({ where: { id: req.params.id } });
    if (tournament.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, error: { code: 'NOT_ACTIVE', message: 'Tournament is not active' } });
    }

    // Resolve fixture results + bracket matches atomically. Without a
    // transaction the route could mark fixtures FINISHED and then crash
    // before any bracket match update lands, leaving fixtures resolved
    // but matches stuck ACTIVE — players unable to advance, no easy
    // recovery path. See PLAN-ADMIN-REFACTOR.md Phase 1 #6.
    const { resolved, actualOutcomes, actualTotalGoals } = await prisma.$transaction(async (tx) => {
      for (const r of results) {
        const outcome = r.resultHome > r.resultAway ? 'HOME' : r.resultAway > r.resultHome ? 'AWAY' : 'DRAW';
        await tx.tournamentRoundFixture.updateMany({
          where: { tournamentId: tournament.id, round: tournament.currentRound, fixtureIndex: r.fixtureIndex },
          data: { resultHome: r.resultHome, resultAway: r.resultAway, resultOutcome: outcome, status: 'FINISHED' },
        });
      }

      const fixtures = await tx.tournamentRoundFixture.findMany({
        where: { tournamentId: tournament.id, round: tournament.currentRound },
        orderBy: { fixtureIndex: 'asc' },
      });
      const outcomes = buildActualOutcomes(fixtures);
      const totalGoals = computeTotalGoals(fixtures);
      const resultsJson = JSON.stringify({ outcomes, totalGoals });
      const now = new Date();

      const activeMatches = await tx.tournamentMatch.findMany({
        where: { tournamentId: tournament.id, round: tournament.currentRound, status: 'ACTIVE' },
      });

      let count = 0;
      for (const match of activeMatches) {
        const p1 = parseMatchdayPrediction(match.player1Prediction);
        const p2 = parseMatchdayPrediction(match.player2Prediction);
        if (!p1 || !p2) continue;
        const { winner, p1Score, p2Score } = determineMatchdayWinner(
          { prediction: p1, predictedAt: match.player1PredictedAt!, wallet: match.player1Wallet! },
          { prediction: p2, predictedAt: match.player2PredictedAt!, wallet: match.player2Wallet! },
          outcomes, totalGoals,
        );
        await tx.tournamentMatch.update({
          where: { id: match.id },
          data: { finalPrice: resultsJson, winnerWallet: winner, player1Score: p1Score, player2Score: p2Score, status: 'RESOLVED', resolvedAt: now },
        });
        count++;
      }

      return { resolved: count, actualOutcomes: outcomes, actualTotalGoals: totalGoals };
    });

    console.log(`[Admin] Resolved ${resolved} bracket matches in round ${tournament.currentRound}`);
    res.json({ success: true, data: { resolved, round: tournament.currentRound, actualOutcomes, actualTotalGoals } });
  } catch (error) {
    console.error('[Admin] Resolve matchday error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'Failed' } });
  }
});
