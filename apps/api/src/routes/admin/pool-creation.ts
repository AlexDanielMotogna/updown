import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db';
import { getPoolCreationConfig, invalidatePoolCreationCache } from '../../services/pool-creation/config';

export const adminPoolCreationRouter: RouterType = Router();

const serialize = (c: { allow3m: boolean; allow5m: boolean; allow15m: boolean; allow1h: boolean }) => ({
  allow3m: c.allow3m,
  allow5m: c.allow5m,
  allow15m: c.allow15m,
  allow1h: c.allow1h,
});

/** GET / — current per-interval pool-creation toggles. */
adminPoolCreationRouter.get('/', async (_req, res) => {
  try {
    res.json({ success: true, data: serialize(await getPoolCreationConfig()) });
  } catch (e) {
    console.error('[Admin] pool-creation get error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load config' } });
  }
});

/** PUT / — update toggles (any subset of allow3m/allow5m/allow15m/allow1h). */
adminPoolCreationRouter.put('/', async (req, res) => {
  try {
    const b = req.body ?? {};
    const data: Record<string, boolean> = {};
    for (const f of ['allow3m', 'allow5m', 'allow15m', 'allow1h']) {
      if (typeof b[f] === 'boolean') data[f] = b[f];
    }
    await getPoolCreationConfig(); // ensure row exists
    const updated = await prisma.poolCreationConfig.update({ where: { id: 'default' }, data });
    invalidatePoolCreationCache();
    res.json({ success: true, data: serialize(updated) });
  } catch (e) {
    console.error('[Admin] pool-creation update error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update config' } });
  }
});
