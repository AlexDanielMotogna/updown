import { Router, type Router as RouterType } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { getXPosterConfig } from '../../services/x-poster/config';
import { hasXCredentials, getAuthedAccount } from '../../services/x-poster/client';
import { runXPosterCycle } from '../../services/x-poster/poster';

export const adminXPosterRouter: RouterType = Router();

function serializeConfig(c: Awaited<ReturnType<typeof getXPosterConfig>>) {
  return {
    enabled: c.enabled,
    intervalSeconds: c.intervalSeconds,
    perCycleCap: c.perCycleCap,
    postSports: c.postSports,
    postPm: c.postPm,
    postCrypto: c.postCrypto,
    includeLink: c.includeLink,
    template: c.template,
  };
}

// GET / - current config + whether X credentials are present in env.
adminXPosterRouter.get('/', async (_req, res) => {
  try {
    const c = await getXPosterConfig();
    res.json({ success: true, data: { ...serializeConfig(c), credentialsConfigured: hasXCredentials() } });
  } catch (e) {
    console.error('[Admin] x-poster get config error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load config' } });
  }
});

// PUT / - update config (all fields optional).
adminXPosterRouter.put('/', async (req, res) => {
  try {
    const b = req.body ?? {};
    const data: Record<string, number | boolean | string> = {};
    for (const f of ['enabled', 'postSports', 'postPm', 'postCrypto', 'includeLink']) {
      if (typeof b[f] === 'boolean') data[f] = b[f];
    }
    for (const f of ['intervalSeconds', 'perCycleCap']) {
      if (b[f] != null && b[f] !== '') data[f] = Number(b[f]);
    }
    if (typeof b.template === 'string' && b.template.trim()) {
      if (!b.template.includes('{title}')) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'template must contain {title}' } });
      }
      data.template = b.template.trim();
    }

    await getXPosterConfig(); // ensure row exists
    const updated = await prisma.xPosterConfig.update({ where: { id: 'default' }, data: data as Prisma.XPosterConfigUpdateInput });
    res.json({ success: true, data: { ...serializeConfig(updated), credentialsConfigured: hasXCredentials() } });
  } catch (e) {
    console.error('[Admin] x-poster update error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update config' } });
  }
});

// POST /kill - hard stop (enabled=false)
adminXPosterRouter.post('/kill', async (_req, res) => {
  try {
    await getXPosterConfig();
    await prisma.xPosterConfig.update({ where: { id: 'default' }, data: { enabled: false } });
    res.json({ success: true });
  } catch (e) {
    console.error('[Admin] x-poster kill error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to stop poster' } });
  }
});

// GET /verify - confirm which @handle the credentials post AS (no tweet sent).
adminXPosterRouter.get('/verify', async (_req, res) => {
  try {
    if (!hasXCredentials()) {
      return res.status(400).json({ success: false, error: { code: 'NOT_CONFIGURED', message: 'X API credentials are missing in env' } });
    }
    const account = await getAuthedAccount();
    res.json({ success: true, data: account });
  } catch (e) {
    console.error('[Admin] x-poster verify error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e instanceof Error ? e.message : 'Failed to verify account' } });
  }
});

// POST /run-now - trigger one cycle immediately (manual test). Respects config +
// credentials; returns how many tweets were posted.
adminXPosterRouter.post('/run-now', async (_req, res) => {
  try {
    if (!hasXCredentials()) {
      return res.status(400).json({ success: false, error: { code: 'NOT_CONFIGURED', message: 'X API credentials are missing in env' } });
    }
    const { posted } = await runXPosterCycle();
    res.json({ success: true, data: { posted } });
  } catch (e) {
    console.error('[Admin] x-poster run-now error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e instanceof Error ? e.message : 'Failed to run cycle' } });
  }
});
