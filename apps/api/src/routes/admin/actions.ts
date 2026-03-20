import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { PoolStatus, Prisma } from '@prisma/client';
import { getScheduler } from '../../scheduler/pool-scheduler';
import { serializePool } from '../../utils/serializers';

export const adminActionsRouter: RouterType = Router();

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

// POST /actions/create-pool (moved from /api/pools/test)
const createPoolSchema = z.object({
  asset: z.enum(['BTC', 'ETH', 'SOL']).default('BTC'),
  intervalKey: z.enum(['1m', '5m', '15m', '1h']).default('5m'),
  intervalSeconds: z.number().min(60).default(300),
  joinWindowSeconds: z.number().min(30).default(120),
  lockBufferSeconds: z.number().min(5).default(15),
});

adminActionsRouter.post('/create-pool', async (req, res) => {
  try {
    const parsed = createPoolSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body', details: parsed.error.flatten() } });
    }

    const { asset, intervalKey, intervalSeconds, joinWindowSeconds, lockBufferSeconds } = parsed.data;
    const scheduler = getScheduler();
    const poolId = await scheduler.createPoolManual(asset, intervalSeconds, joinWindowSeconds, intervalKey, lockBufferSeconds);

    if (!poolId) {
      return res.status(500).json({ success: false, error: { code: 'POOL_CREATION_FAILED', message: 'Failed to create pool' } });
    }

    await logAdminEvent('ADMIN_CREATE_POOL', poolId, { action: 'create-pool', asset, intervalKey });

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    res.status(201).json({ success: true, data: pool ? serializePool(pool) : { id: poolId }, message: 'Pool created' });
  } catch (error) {
    console.error('Admin create-pool error:', error);
    res.status(500).json({ success: false, error: { code: 'CREATE_ERROR', message: error instanceof Error ? error.message : 'Failed to create pool' } });
  }
});
