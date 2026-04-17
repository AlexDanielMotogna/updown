import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import type { PoolStatus, Prisma } from '@prisma/client';
import { serializePool } from '../utils/serializers';
import { getAllLiveScoresWithFallback, getLiveScoreWithFallback, getLiveScoreByTeamWithFallback } from '../services/sports/livescore';

export const poolsRouter: RouterType = Router();

// Filter schema with pagination
const poolFilterSchema = z.object({
  asset: z.string().optional(),
  interval: z.string().optional(),
  status: z.string().optional(), // Single status or comma-separated list (e.g. "JOINING,ACTIVE")
  type: z.enum(['CRYPTO', 'SPORTS']).optional(), // Pool type filter
  league: z.string().optional(), // League/category code (e.g. "PL", "PM_POLITICS")
  tag: z.string().optional(), // Subcategory tag filter (PM pools)
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).default(20),
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

    const { asset, interval, status, type, league, tag, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    // Build where clause — exclude squad pools from public markets
    const where: Prisma.PoolWhereInput = { squadId: null };
    if (type) {
      where.poolType = type;
    }
    if (league) {
      where.league = league;
    }
    if (tag) {
      where.tags = { contains: tag };
    }
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

    const sideCountMap = new Map<string, { upCount: number; downCount: number; drawCount: number }>();
    for (const row of sideCounts) {
      const existing = sideCountMap.get(row.poolId) || { upCount: 0, downCount: 0, drawCount: 0 };
      if (row.side === 'UP') existing.upCount = row._count;
      else if (row.side === 'DOWN') existing.downCount = row._count;
      else if (row.side === 'DRAW') existing.drawCount = row._count;
      sideCountMap.set(row.poolId, existing);
    }

    res.json({
      success: true,
      data: pools.map(pool => {
        const counts = sideCountMap.get(pool.id) || { upCount: 0, downCount: 0, drawCount: 0 };
        return {
          ...serializePool(pool),
          betCount: pool._count.bets,
          upCount: counts.upCount,
          downCount: counts.downCount,
          drawCount: counts.drawCount,
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

// GET /api/pools/livescores — all current live scores (must be before /:id)
poolsRouter.get('/livescores', async (_req, res) => {
  const data = await getAllLiveScoresWithFallback();
  res.json({ success: true, data });
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

// GET /api/pools/:id/bets - Get individual predictions for a pool (from event log)
poolsRouter.get('/:id/bets', async (req, res) => {
  try {
    // Use eventLog for individual deposit entries (bet table merges same-wallet deposits)
    const events = await prisma.eventLog.findMany({
      where: {
        eventType: 'DEPOSIT_CONFIRMED',
        entityType: 'bet',
        payload: { path: ['poolId'], equals: req.params.id },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const data = events.map(e => {
      const p = e.payload as { walletAddress?: string; side?: string; amount?: string };
      const w = p.walletAddress || '';
      return {
        wallet: `${w.slice(0, 4)}...${w.slice(-4)}`,
        side: p.side || 'UP',
        amount: p.amount || '0',
        createdAt: e.createdAt.toISOString(),
      };
    });

    // Fallback: if no event logs (old pools), use bet table
    if (data.length === 0) {
      const bets = await prisma.bet.findMany({
        where: { poolId: req.params.id },
        select: { walletAddress: true, side: true, amount: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return res.json({
        success: true,
        data: bets.map(b => ({
          wallet: `${b.walletAddress.slice(0, 4)}...${b.walletAddress.slice(-4)}`,
          side: b.side,
          amount: b.amount.toString(),
          createdAt: b.createdAt.toISOString(),
        })),
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching pool bets:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch bets' } });
  }
});

// GET /api/pools/:id/odds-history - Get Polymarket price history for chart
poolsRouter.get('/:id/odds-history', async (req, res) => {
  try {
    const pool = await prisma.pool.findUnique({ where: { id: req.params.id } });
    if (!pool) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pool not found' } });

    // Try pool first, fallback to fixture cache for older pools
    let rawTokenIds = pool.clobTokenIds;
    if (!rawTokenIds && pool.matchId) {
      const cached = await prisma.sportsFixtureCache.findFirst({
        where: { externalId: pool.matchId },
        select: { clobTokenIds: true },
      });
      rawTokenIds = cached?.clobTokenIds ?? null;
    }
    if (!rawTokenIds) return res.json({ success: true, data: { history: [] } });

    let tokenIds: string[];
    try {
      tokenIds = JSON.parse(rawTokenIds);
    } catch {
      return res.json({ success: true, data: { history: [] } });
    }

    if (!tokenIds.length) return res.json({ success: true, data: { history: [] } });

    const yesTokenId = tokenIds[0];
    const interval = (req.query.interval as string) || 'max';
    const fidelity = (req.query.fidelity as string) || '60'; // hourly by default

    const clobRes = await fetch(
      `https://clob.polymarket.com/prices-history?market=${yesTokenId}&interval=${interval}&fidelity=${fidelity}`,
    );

    if (!clobRes.ok) {
      console.warn(`[OddsHistory] CLOB API error: ${clobRes.status}`);
      return res.json({ success: true, data: { history: [] } });
    }

    const data: any = await clobRes.json();

    res.json({
      success: true,
      data: {
        history: data.history || [],
        question: pool.homeTeam,
        currentOdds: pool.marketOdds,
      },
    });
  } catch (error) {
    console.error('Error fetching odds history:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch odds history' } });
  }
});

// GET /api/pools/:id/livescore — live score for a specific pool's match
poolsRouter.get('/:id/livescore', async (req, res) => {
  try {
    const pool = await prisma.pool.findUnique({
      where: { id: req.params.id },
      select: { matchId: true, homeTeam: true },
    });
    if (!pool?.matchId) return res.json({ success: true, data: null });
    // Try by eventId first, then fallback to DB (TheSportsDB sports: NBA, NHL, NFL, MMA)
    let score = await getLiveScoreWithFallback(pool.matchId);
    // Fallback: try by team name (football pools)
    if (!score && pool.homeTeam) {
      score = await getLiveScoreByTeamWithFallback(pool.homeTeam);
    }
    res.json({ success: true, data: score });
  } catch {
    res.json({ success: true, data: null });
  }
});

