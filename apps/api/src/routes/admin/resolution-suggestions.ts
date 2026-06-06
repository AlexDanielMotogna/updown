import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db';
import { resolveMatchPools } from '../../scheduler/sports-scheduler';

export const adminResolutionSuggestionsRouter: RouterType = Router();

/** GET / - pending LLM result suggestions for stuck sports pools. */
adminResolutionSuggestionsRouter.get('/', async (_req, res) => {
  try {
    const suggestions = await prisma.resolutionSuggestion.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    const poolIds = suggestions.map(s => s.poolId);
    const pools = poolIds.length > 0
      ? await prisma.pool.findMany({ where: { id: { in: poolIds } }, select: { id: true, status: true, asset: true, winner: true } })
      : [];
    const poolMap = new Map(pools.map(p => [p.id, p]));
    res.json({ success: true, data: suggestions.map(s => ({ ...s, pool: poolMap.get(s.poolId) ?? null })) });
  } catch (error) {
    console.error('[Admin] list suggestions error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list suggestions' } });
  }
});

/** POST /:id/dismiss - reject a suggestion (pool stays unresolved). */
adminResolutionSuggestionsRouter.post('/:id/dismiss', async (req, res) => {
  try {
    const s = await prisma.resolutionSuggestion.findUnique({ where: { id: req.params.id } });
    if (!s) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Suggestion not found' } });
    await prisma.resolutionSuggestion.update({ where: { id: s.id }, data: { status: 'DISMISSED' } });
    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] dismiss suggestion error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to dismiss' } });
  }
});

/**
 * POST /:id/apply - accept the suggested result. Writes the final score to
 * live_scores so the normal resolver settles the pool on-chain with the right
 * winner (same path as a real FT), then marks the suggestion APPLIED.
 */
adminResolutionSuggestionsRouter.post('/:id/apply', async (req, res) => {
  try {
    const s = await prisma.resolutionSuggestion.findUnique({ where: { id: req.params.id } });
    if (!s) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Suggestion not found' } });
    if (!s.matchId) return res.status(400).json({ success: false, error: { code: 'NO_MATCH', message: 'Suggestion has no matchId' } });

    const pool = await prisma.pool.findUnique({ where: { id: s.poolId }, select: { status: true } });
    if (!pool) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pool not found' } });
    if (pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE') {
      await prisma.resolutionSuggestion.update({ where: { id: s.id }, data: { status: 'APPLIED' } });
      return res.json({ success: true, data: { note: 'Pool already resolved' } });
    }

    // Feed the result through the standard resolver path (live_scores FT).
    await prisma.liveScore.upsert({
      where: { eventId: s.matchId },
      create: {
        eventId: s.matchId, sport: 'Soccer', league: s.league ?? '',
        homeTeam: s.homeTeam, awayTeam: s.awayTeam,
        homeScore: s.homeScore, awayScore: s.awayScore, status: 'FT',
      },
      update: { homeScore: s.homeScore, awayScore: s.awayScore, status: 'FT' },
    });
    await prisma.resolutionSuggestion.update({ where: { id: s.id }, data: { status: 'APPLIED' } });

    // Settle now (best-effort; the 2-min resolver loop would also catch it).
    resolveMatchPools().catch(e => console.error('[Admin] apply -> resolve error:', e));
    res.json({ success: true, data: { winner: s.suggestedWinner } });
  } catch (error) {
    console.error('[Admin] apply suggestion error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to apply' } });
  }
});
