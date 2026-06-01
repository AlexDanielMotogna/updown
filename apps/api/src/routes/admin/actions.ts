import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { PoolStatus, Prisma } from '@prisma/client';
import { getScheduler } from '../../scheduler/pool-scheduler';
import { serializePool } from '../../utils/serializers';
import { bulkSync as polymarketBulkSync, recategorizePmPools } from '../../scheduler/polymarket-sync';
import { dailySync as fixtureDailySync } from '../../scheduler/fixture-sync';
import { createMatchPools } from '../../scheduler/sports-scheduler';
import { cancelPmPool, isMarketDelistedFromGamma, sweepStuckPmPools } from '../../scheduler/pm-cancel';

export const adminActionsRouter: RouterType = Router();

// Guard so concurrent button clicks don't stack overlapping syncs.
let syncPoolsRunning = false;

async function logAdminEvent(eventType: string, entityId: string, payload: Record<string, string>) {
  await prisma.eventLog.create({
    data: {
      eventType,
      entityType: 'admin',
      entityId,
      payload: payload as Prisma.InputJsonValue,
    },
  });
}

// POST /actions/resolve-pool
const resolvePoolSchema = z.object({ poolId: z.string().uuid() });

adminActionsRouter.post('/resolve-pool', async (req, res) => {
  try {
    const parsed = resolvePoolSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body', details: parsed.error.flatten() } });
    }

    const { poolId } = parsed.data;
    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pool not found' } });
    }

    if (pool.status !== PoolStatus.JOINING && pool.status !== PoolStatus.ACTIVE) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: `Pool is ${pool.status}, must be JOINING or ACTIVE` } });
    }

    const scheduler = getScheduler();
    const resolver = scheduler.getResolver();
    await resolver.forceResolvePool(pool);

    await logAdminEvent('ADMIN_FORCE_RESOLVE', poolId, { action: 'resolve-pool' });

    const updated = await prisma.pool.findUnique({ where: { id: poolId } });
    res.json({ success: true, data: updated ? serializePool(updated) : { id: poolId }, message: 'Pool resolution triggered' });
  } catch (error) {
    console.error('Admin resolve-pool error:', error);
    res.status(500).json({ success: false, error: { code: 'ACTION_ERROR', message: error instanceof Error ? error.message : 'Failed to resolve pool' } });
  }
});

// POST /actions/refund-pool
const refundPoolSchema = z.object({ poolId: z.string().uuid() });

adminActionsRouter.post('/refund-pool', async (req, res) => {
  try {
    const parsed = refundPoolSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body', details: parsed.error.flatten() } });
    }

    const { poolId } = parsed.data;
    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pool not found' } });
    }

    const scheduler = getScheduler();
    const resolver = scheduler.getResolver();
    await resolver.forceRefundPool(poolId);

    await logAdminEvent('ADMIN_FORCE_REFUND', poolId, { action: 'refund-pool' });

    const updated = await prisma.pool.findUnique({ where: { id: poolId } });
    res.json({ success: true, data: updated ? serializePool(updated) : { id: poolId }, message: 'Pool refund triggered' });
  } catch (error) {
    console.error('Admin refund-pool error:', error);
    res.status(500).json({ success: false, error: { code: 'ACTION_ERROR', message: error instanceof Error ? error.message : 'Failed to refund pool' } });
  }
});

// POST /actions/close-pool
const closePoolSchema = z.object({ poolId: z.string().uuid(), force: z.boolean().optional() });

adminActionsRouter.post('/close-pool', async (req, res) => {
  try {
    const parsed = closePoolSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body', details: parsed.error.flatten() } });
    }

    const { poolId, force } = parsed.data;
    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pool not found' } });
    }

    if (pool.status !== PoolStatus.CLAIMABLE) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: `Pool is ${pool.status}, must be CLAIMABLE` } });
    }

    if (!force) {
      const unclaimed = await prisma.bet.count({ where: { poolId, claimed: false } });
      if (unclaimed > 0) {
        return res.status(400).json({ success: false, error: { code: 'UNCLAIMED_BETS', message: `${unclaimed} unclaimed bet(s) remain. Use force=true to override.` } });
      }
    }

    const scheduler = getScheduler();
    const resolver = scheduler.getResolver();
    await resolver.forceClosePool(poolId);

    await logAdminEvent('ADMIN_FORCE_CLOSE', poolId, { action: 'close-pool', force: String(!!force) });

    res.json({ success: true, message: 'Pool closed and cleaned up' });
  } catch (error) {
    console.error('Admin close-pool error:', error);
    res.status(500).json({ success: false, error: { code: 'ACTION_ERROR', message: error instanceof Error ? error.message : 'Failed to close pool' } });
  }
});

// POST /actions/restart-scheduler
adminActionsRouter.post('/restart-scheduler', async (_req, res) => {
  try {
    const scheduler = getScheduler();
    scheduler.stop();
    await scheduler.start();

    await logAdminEvent('ADMIN_RESTART_SCHEDULER', 'scheduler', { action: 'restart-scheduler' });

    res.json({ success: true, data: scheduler.getStatus(), message: 'Scheduler restarted' });
  } catch (error) {
    console.error('Admin restart-scheduler error:', error);
    res.status(500).json({ success: false, error: { code: 'ACTION_ERROR', message: error instanceof Error ? error.message : 'Failed to restart scheduler' } });
  }
});

// POST /actions/recover-orphaned-pools (SSE streaming)
let recoveryAbort: (() => void) | null = null;

adminActionsRouter.post('/recover-orphaned-pools', async (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Abort signal for stopping mid-scan
  let aborted = false;
  recoveryAbort = () => { aborted = true; };

  try {
    const scheduler = getScheduler();
    const resolver = scheduler.getResolver();
    const result = await resolver.recoverOrphanedPools(
      (event) => { send(event); },
      () => aborted,
    );

    await logAdminEvent('ADMIN_RECOVER_ORPHANS', 'system', {
      totalOnChain: result.totalOnChain.toString(),
      orphaned: result.orphaned.toString(),
      closed: result.closed.toString(),
      skipped: result.skipped.toString(),
      failed: result.failed.toString(),
      totalRentReclaimed: result.totalRentReclaimed,
    });

    send({ type: 'done', ...result });
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'Recovery failed' });
  }
  recoveryAbort = null;
  res.end();
});

// POST /actions/stop-recovery
adminActionsRouter.post('/stop-recovery', async (_req, res) => {
  if (recoveryAbort) {
    recoveryAbort();
    res.json({ success: true, message: 'Stop signal sent' });
  } else {
    res.json({ success: true, message: 'No recovery running' });
  }
});

// POST /actions/sync-pools - re-sync sources with the latest category config and
// create pools immediately, instead of waiting for the next scheduled cycle.
// Runs in the background (sync + on-chain pool creation can take a minute or two).
const syncPoolsSchema = z.object({
  scope: z.enum(['all', 'predictions', 'sports']).default('all'),
});

adminActionsRouter.post('/sync-pools', async (req, res) => {
  const parsed = syncPoolsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid scope' } });
  }
  const { scope } = parsed.data;

  if (syncPoolsRunning) {
    return res.status(409).json({ success: false, error: { code: 'ALREADY_RUNNING', message: 'A sync is already in progress' } });
  }
  syncPoolsRunning = true;

  // Fire-and-forget: respond right away, do the slow work in the background.
  (async () => {
    try {
      if (scope === 'all' || scope === 'predictions') await polymarketBulkSync();
      if (scope === 'all' || scope === 'sports') await fixtureDailySync();
      await createMatchPools();
      // Re-apply categorization/subcategories to EXISTING pools so admin config
      // changes (new sidebar filters, etc.) show up without recreating pools.
      if (scope === 'all' || scope === 'predictions') await recategorizePmPools();
      console.log(`[Admin] sync-pools (${scope}) complete`);
    } catch (err) {
      console.error('[Admin] sync-pools failed:', err instanceof Error ? err.message : err);
    } finally {
      syncPoolsRunning = false;
    }
  })();

  await logAdminEvent('ADMIN_SYNC_POOLS', 'system', { scope });
  res.json({ success: true, message: 'Sync started - new pools will be created within a minute or two. Refresh to see them.' });
});

// POST /actions/create-pool (moved from /api/pools/test)
//
// Per PLAN-ADMIN-REFACTOR.md Phase 1 #4, the UI sends only `{asset,
// intervalKey}` and the old schema's `intervalSeconds: default(300)`
// meant every Create Pool dropdown selection (3m / 5m / 15m / 1h) was
// silently coerced to a 5-minute pool. Now we derive the timing knobs
// from intervalKey when they aren't explicitly provided, so the
// dropdown label matches the on-chain interval.
const INTERVAL_PRESETS: Record<'3m' | '5m' | '15m' | '1h', { intervalSeconds: number; joinWindowSeconds: number; lockBufferSeconds: number }> = {
  '3m': { intervalSeconds: 180,  joinWindowSeconds: 60,  lockBufferSeconds: 15 },
  '5m': { intervalSeconds: 300,  joinWindowSeconds: 120, lockBufferSeconds: 15 },
  '15m':{ intervalSeconds: 900,  joinWindowSeconds: 300, lockBufferSeconds: 30 },
  '1h': { intervalSeconds: 3600, joinWindowSeconds: 900, lockBufferSeconds: 60 },
};

const createPoolSchema = z.object({
  asset: z.enum(['BTC', 'ETH', 'SOL']).default('BTC'),
  intervalKey: z.enum(['3m', '5m', '15m', '1h']).default('5m'),
  // intervalSeconds / joinWindowSeconds / lockBufferSeconds are optional —
  // when absent we derive them from intervalKey via INTERVAL_PRESETS at the
  // handler. Explicit values override the preset (kept for scripted callers).
  intervalSeconds: z.number().min(60).optional(),
  joinWindowSeconds: z.number().min(30).optional(),
  lockBufferSeconds: z.number().min(5).optional(),
});

// POST /actions/cancel-pm-pool - cancel a stuck Polymarket pool (delisted from
// Gamma or stuck past the UMA grace window). 0-bet pools get closed on-chain
// to reclaim rent; pools with bets get refunded first via the standard refund
// path. The DB row is kept (status=CANCELLED, winner=null) for audit.
const cancelPmPoolSchema = z.object({
  poolId: z.string().uuid(),
  reason: z.string().min(1).max(200).optional(),
});

adminActionsRouter.post('/cancel-pm-pool', async (req, res) => {
  try {
    const parsed = cancelPmPoolSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body', details: parsed.error.flatten() } });
    }
    const { poolId, reason } = parsed.data;
    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pool not found' } });
    if (!pool.league?.startsWith('PM_')) {
      return res.status(400).json({ success: false, error: { code: 'NOT_PM_POOL', message: 'Pool is not a Polymarket pool' } });
    }

    const result = await cancelPmPool(poolId, reason || 'admin-action');
    await logAdminEvent('ADMIN_CANCEL_PM_POOL', poolId, { action: 'cancel-pm-pool', result: result.status });
    res.json({ success: true, data: { poolId, ...result }, message: `Pool ${result.status}` });
  } catch (error) {
    console.error('Admin cancel-pm-pool error:', error);
    res.status(500).json({ success: false, error: { code: 'ACTION_ERROR', message: error instanceof Error ? error.message : 'Failed to cancel pool' } });
  }
});

// GET /actions/stuck-pm-pools - list PM pools that are past kickoff but still
// JOINING/ACTIVE, flagging those whose Gamma market has been delisted so admin
// can prioritise them. Filters: minHoursOverdue (default 0 = all overdue).
adminActionsRouter.get('/stuck-pm-pools', async (req, res) => {
  try {
    const minHours = Math.max(0, Number(req.query.minHoursOverdue) || 0);
    const cutoff = new Date(Date.now() - minHours * 60 * 60 * 1000);
    const stuck = await prisma.pool.findMany({
      where: {
        poolType: 'SPORTS',
        status: { in: [PoolStatus.JOINING, PoolStatus.ACTIVE] },
        league: { startsWith: 'PM_' },
        startTime: { lte: cutoff },
      },
      orderBy: { startTime: 'asc' },
      select: { id: true, matchId: true, homeTeam: true, league: true, subcategory: true, startTime: true, status: true },
    });
    // Annotate each with bet count + Gamma availability (lookup is rate-limited
    // to 3s/call by polymarketFetch — keep the result set small).
    const enriched = await Promise.all(stuck.slice(0, 20).map(async (p) => {
      const betCount = await prisma.bet.count({ where: { poolId: p.id } });
      const delisted = p.matchId ? await isMarketDelistedFromGamma(p.matchId) : null;
      const hoursOverdue = Math.round((Date.now() - p.startTime.getTime()) / (60 * 60 * 1000));
      return { ...p, betCount, gammaDelisted: delisted, hoursOverdue };
    }));
    res.json({ success: true, data: { pools: enriched, totalCount: stuck.length, truncated: stuck.length > 20 } });
  } catch (error) {
    console.error('Admin stuck-pm-pools error:', error);
    res.status(500).json({ success: false, error: { code: 'ACTION_ERROR', message: error instanceof Error ? error.message : 'Failed to list stuck pools' } });
  }
});

// POST /actions/sweep-pm-pools - manually trigger the PM sweep (otherwise runs
// every 15 minutes). Auto-cancels 0-bet stuck pools; pools with bets are left
// for individual admin review.
adminActionsRouter.post('/sweep-pm-pools', async (_req, res) => {
  try {
    await sweepStuckPmPools();
    await logAdminEvent('ADMIN_SWEEP_PM_POOLS', 'system', { action: 'sweep-pm-pools' });
    res.json({ success: true, message: 'PM sweep complete - see logs for details' });
  } catch (error) {
    console.error('Admin sweep-pm-pools error:', error);
    res.status(500).json({ success: false, error: { code: 'ACTION_ERROR', message: error instanceof Error ? error.message : 'Sweep failed' } });
  }
});

adminActionsRouter.post('/create-pool', async (req, res) => {
  try {
    const parsed = createPoolSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body', details: parsed.error.flatten() } });
    }

    const { asset, intervalKey } = parsed.data;
    // Apply the preset from intervalKey when the explicit timing knobs
    // aren't sent. Explicit values still override (for scripted callers).
    const preset = INTERVAL_PRESETS[intervalKey];
    const intervalSeconds = parsed.data.intervalSeconds ?? preset.intervalSeconds;
    const joinWindowSeconds = parsed.data.joinWindowSeconds ?? preset.joinWindowSeconds;
    const lockBufferSeconds = parsed.data.lockBufferSeconds ?? preset.lockBufferSeconds;

    const scheduler = getScheduler();
    const poolId = await scheduler.createPoolManual(asset, intervalSeconds, joinWindowSeconds, intervalKey, lockBufferSeconds);

    if (!poolId) {
      return res.status(500).json({ success: false, error: { code: 'POOL_CREATION_FAILED', message: 'Failed to create pool' } });
    }

    await logAdminEvent('ADMIN_CREATE_POOL', poolId, { action: 'create-pool', asset, intervalKey, intervalSeconds: String(intervalSeconds) });

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    res.status(201).json({ success: true, data: pool ? serializePool(pool) : { id: poolId }, message: 'Pool created' });
  } catch (error) {
    console.error('Admin create-pool error:', error);
    res.status(500).json({ success: false, error: { code: 'CREATE_ERROR', message: error instanceof Error ? error.message : 'Failed to create pool' } });
  }
});
