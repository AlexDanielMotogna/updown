import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import type { PoolStatus, Prisma } from '@prisma/client';
import { serializePool } from '../utils/serializers';

export const poolsRouter: RouterType = Router();

// Filter schema with pagination
const poolFilterSchema = z.object({
  asset: z.string().optional(),
  interval: z.string().optional(),
  status: z.string().optional(), // Single status or comma-separated list (e.g. "JOINING,ACTIVE")
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// GET /api/pools - List all pools with optional filters
poolsRouter.get('/', async (req, res) => {
  try {
    const parsed = poolFilterSchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parsed.error.flatten(),
        },
      });
    }

    const { asset, interval, status, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.PoolWhereInput = {};
    if (asset) {
      where.asset = asset.toUpperCase();
    }
    if (interval) {
      where.interval = interval;
    }
    if (status) {
      const statuses = status.split(',').map(s => s.trim().toUpperCase()) as PoolStatus[];
      const validStatuses: PoolStatus[] = ['UPCOMING', 'JOINING', 'ACTIVE', 'RESOLVED', 'CLAIMABLE'];
      const filtered = statuses.filter(s => validStatuses.includes(s));
      if (filtered.length === 1) {
        where.status = filtered[0];
        // Hide expired UPCOMING pools whose start time has already passed
        if (filtered[0] === 'UPCOMING') {
          where.startTime = { gt: new Date() };
        }
      } else if (filtered.length > 1) {
        where.status = { in: filtered };
      }
    }

    // Execute queries in parallel
    const [pools, total] = await Promise.all([
      prisma.pool.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              bets: true,
            },
          },
        },
      }),
      prisma.pool.count({ where }),
    ]);

    // Count bets per side for each pool
    const poolIds = pools.map(p => p.id);
    const sideCounts = poolIds.length > 0
      ? await prisma.bet.groupBy({
          by: ['poolId', 'side'],
          where: { poolId: { in: poolIds } },
          _count: true,
        })
      : [];

    const sideCountMap = new Map<string, { upCount: number; downCount: number }>();
    for (const row of sideCounts) {
      const existing = sideCountMap.get(row.poolId) || { upCount: 0, downCount: 0 };
      if (row.side === 'UP') existing.upCount = row._count;
      else existing.downCount = row._count;
      sideCountMap.set(row.poolId, existing);
    }

    res.json({
      success: true,
      data: pools.map(pool => {
        const counts = sideCountMap.get(pool.id) || { upCount: 0, downCount: 0 };
        return {
          ...serializePool(pool),
          betCount: pool._count.bets,
          upCount: counts.upCount,
          downCount: counts.downCount,
        };
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching pools:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch pools',
      },
    });
  }
});

// GET /api/pools/:id - Get single pool with details
poolsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await prisma.pool.findFirst({
      where: {
        OR: [
          { id },
          { poolId: id },
        ],
      },
      include: {
        priceSnapshots: {
          orderBy: { timestamp: 'asc' },
        },
        _count: {
          select: { bets: true },
        },
      },
    });

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'POOL_NOT_FOUND',
          message: `Pool with ID ${id} does not exist`,
        },
      });
    }

    // Calculate odds
    const totalPool = pool.totalUp + pool.totalDown;
    const upOdds = totalPool > 0n
      ? Number(pool.totalDown) / Number(pool.totalUp) + 1
      : 2;
    const downOdds = totalPool > 0n
      ? Number(pool.totalUp) / Number(pool.totalDown) + 1
      : 2;

    res.json({
      success: true,
      data: {
        ...serializePool(pool),
        betCount: pool._count.bets,
        odds: {
          up: isFinite(upOdds) ? upOdds.toFixed(2) : '∞',
          down: isFinite(downOdds) ? downOdds.toFixed(2) : '∞',
        },
        priceSnapshots: pool.priceSnapshots.map(snap => ({
          id: snap.id,
          type: snap.type,
          price: snap.price.toString(),
          timestamp: snap.timestamp.toISOString(),
          source: snap.source,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching pool:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch pool',
      },
    });
  }
});

