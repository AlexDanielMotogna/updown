import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { PoolStatus } from '@prisma/client';
import { serializePool } from '../../utils/serializers';

export const adminPoolsRouter: RouterType = Router();

const poolFilterSchema = z.object({
  status: z.string().optional(),
  asset: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(50),
});

// GET /pools - All pools with filters
adminPoolsRouter.get('/', async (req, res) => {
  try {
    const parsed = poolFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: parsed.error.flatten() } });
    }

    const { status, asset, page, limit } = parsed.data;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (status) {
      const statuses = status.split(',').map(s => s.trim().toUpperCase());
      if (statuses.length === 1) where.status = statuses[0];
      else where.status = { in: statuses };
    }
    if (asset) where.asset = asset.toUpperCase();

    const [pools, total] = await Promise.all([
      prisma.pool.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { _count: { select: { bets: true } } },
      }),
      prisma.pool.count({ where }),
    ]);

    res.json({
      success: true,
      data: pools.map(pool => ({
        ...serializePool(pool),
        betCount: pool._count.bets,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin pools error:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch pools' } });
  }
});

// GET /pools/stuck - Pools past endTime still in JOINING/ACTIVE
adminPoolsRouter.get('/stuck', async (_req, res) => {
  try {
    const now = new Date();
    const stuckPools = await prisma.pool.findMany({
      where: {
        status: { in: [PoolStatus.JOINING, PoolStatus.ACTIVE] },
        endTime: { lte: now },
      },
      include: { _count: { select: { bets: true } } },
      orderBy: { endTime: 'asc' },
    });

    res.json({
      success: true,
      data: stuckPools.map(pool => ({
        ...serializePool(pool),
        betCount: pool._count.bets,
        stuckMinutes: Math.round((now.getTime() - pool.endTime.getTime()) / 60000),
      })),
    });
  } catch (error) {
    console.error('Admin stuck pools error:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch stuck pools' } });
  }
});

// GET /pools/:id - Deep dive with bets
adminPoolsRouter.get('/:id', async (req, res) => {
  try {
    const pool = await prisma.pool.findFirst({
      where: { OR: [{ id: req.params.id }, { poolId: req.params.id }] },
      include: {
        bets: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            walletAddress: true,
            side: true,
            amount: true,
            claimed: true,
            claimTx: true,
            payoutAmount: true,
            createdAt: true,
          },
        },
        priceSnapshots: { orderBy: { timestamp: 'asc' } },
        _count: { select: { bets: true } },
      },
    });

    if (!pool) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pool not found' } });
    }

    res.json({
      success: true,
      data: {
        ...serializePool(pool),
        betCount: pool._count.bets,
        bets: pool.bets.map(b => ({
          ...b,
          amount: b.amount.toString(),
          payoutAmount: b.payoutAmount?.toString() ?? null,
          createdAt: b.createdAt.toISOString(),
        })),
        priceSnapshots: pool.priceSnapshots.map(s => ({
          id: s.id,
          type: s.type,
          price: s.price.toString(),
          timestamp: s.timestamp.toISOString(),
          source: s.source,
        })),
      },
    });
  } catch (error) {
    console.error('Admin pool detail error:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch pool' } });
  }
});
