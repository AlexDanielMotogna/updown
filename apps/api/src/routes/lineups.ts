import { Router, type Router as RouterType } from 'express';
import { getEventLineup } from '../services/sports/lineups';

export const lineupsRouter: RouterType = Router();

/** GET /api/lineups/:matchId — team lineups (from TheSportsDB) for a sports
 *  pool's match. Returns { hasData, home, away } so the UI hides the section
 *  cleanly when there's no coverage (e.g. NHL, MMA). */
lineupsRouter.get('/:matchId', async (req, res) => {
  try {
    const matchId = req.params.matchId;
    if (!matchId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'matchId required' } });
    const data = await getEventLineup(matchId);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[Lineups] route error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load lineup' } });
  }
});
