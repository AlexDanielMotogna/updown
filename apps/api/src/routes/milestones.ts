import { Router, type Router as RouterType } from 'express';
import { getMilestoneState } from '../services/milestones';

export const milestonesRouter: RouterType = Router();

/** GET /api/milestones — community milestone progress + contributor board.
 *  `?wallet` adds the caller's contribution + qualification. */
milestonesRouter.get('/', async (req, res) => {
  try {
    const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : null;
    const state = await getMilestoneState(wallet);
    res.json({ success: true, data: state });
  } catch (error) {
    console.error('[Milestones] state error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load milestones' } });
  }
});
