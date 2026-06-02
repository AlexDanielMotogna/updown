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

    // Build where clause - exclude squad pools from public markets
    const where: Prisma.PoolWhereInput = { squadId: null };
    if (type) {
      where.poolType = type;
    }
    if (league) {
      where.league = league;
    }
    if (tag) {
      // Faceted filter: match any pool whose raw Polymarket tag list includes this
      // tag. `tags` is a JSON array string (e.g. ["Trump","US Election"]); quoting
      // the needle (`"Trump"`) prevents prefix false-positives like "Trumpism".
      // Multi-tag by design - a pool legitimately appears under each of its tags,
      // and every imported pool is covered (no orphaned/uncategorised pools).
      where.tags = { contains: JSON.stringify(tag) };
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

// GET /api/pools/livescores - all current live scores (must be before /:id)
poolsRouter.get('/livescores', async (_req, res) => {
  const data = await getAllLiveScoresWithFallback();
  res.json({ success: true, data });
});

// GET /api/pools/search?q=bitcoin - typeahead search over ACTIVE pools (open for
// betting). Matches the market question/team (homeTeam, awayTeam) and crypto asset.
// Returns a lightweight shape for the navbar search dropdown. Must be before /:id.
poolsRouter.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, data: [] });

    const pools = await prisma.pool.findMany({
      where: {
        squadId: null,
        status: { in: ['JOINING', 'ACTIVE'] },
        OR: [
          { homeTeam: { contains: q, mode: 'insensitive' } },
          { awayTeam: { contains: q, mode: 'insensitive' } },
          { asset: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ status: 'asc' }, { startTime: 'asc' }],
      take: 12,
      select: {
        id: true, status: true, poolType: true, league: true,
        asset: true, interval: true, homeTeam: true, awayTeam: true,
        homeTeamCrest: true, startTime: true,
      },
    });

    res.json({
      success: true,
      data: pools.map(p => ({
        id: p.id,
        status: p.status,
        poolType: p.poolType,
        league: p.league,
        asset: p.asset,
        interval: p.interval,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        homeTeamCrest: p.homeTeamCrest,
        startTime: p.startTime.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error searching pools:', error);
    res.json({ success: true, data: [] });
  }
});

// GET /api/pools/trending - most active pools right now, across ALL types
// (crypto + sports + PM). Ranked by 24h staked volume, then recent bet count,
// then total pool size - the same "recent activity" signal Polymarket/Kalshi use.
// Returns the same item shape as GET /api/pools so the grid can reuse the cards.
poolsRouter.get('/trending', async (_req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const active = await prisma.pool.findMany({
      where: { squadId: null, status: { in: ['JOINING', 'ACTIVE'] } },
      include: { _count: { select: { bets: true } } },
    });
    if (active.length === 0) return res.json({ success: true, data: [] });

    const ids = active.map(p => p.id);
    const recent = await prisma.bet.groupBy({
      by: ['poolId'],
      where: { poolId: { in: ids }, createdAt: { gte: since } },
      _sum: { amount: true },
      _count: true,
    });
    const recentMap = new Map(recent.map(r => [r.poolId, { vol: r._sum.amount ?? 0n, count: r._count }]));

    const scored = active.map(p => ({
      pool: p,
      recentVol: recentMap.get(p.id)?.vol ?? 0n,
      recentCount: recentMap.get(p.id)?.count ?? 0,
      totalPool: p.totalUp + p.totalDown + (p.totalDraw ?? 0n),
    }));

    // Most-active-first within a category.
    const byActivity = (a: typeof scored[number], b: typeof scored[number]) =>
      a.recentVol !== b.recentVol ? (a.recentVol > b.recentVol ? -1 : 1)
      : a.recentCount !== b.recentCount ? b.recentCount - a.recentCount
      : a.totalPool !== b.totalPool ? (a.totalPool > b.totalPool ? -1 : 1)
      : b.pool._count.bets - a.pool._count.bets;

    const bucketOf = (p: { poolType: string | null; league: string | null }) =>
      p.poolType !== 'SPORTS' ? 'CRYPTO' : p.league?.startsWith('PM_') ? 'PM' : 'SPORTS';

    const buckets: Record<string, typeof scored> = { SPORTS: [], PM: [], CRYPTO: [] };
    for (const s of scored) buckets[bucketOf(s.pool)]!.push(s);
    for (const k of Object.keys(buckets)) buckets[k]!.sort(byActivity);

    // Round-robin across categories so the grid always mixes types (crypto
    // included), with the most active of each type surfacing first.
    const order = ['SPORTS', 'CRYPTO', 'PM'];
    const ranked: typeof scored = [];
    for (let i = 0; ranked.length < 24; i++) {
      let pushed = false;
      for (const k of order) {
        const item = buckets[k]![i];
        if (item) { ranked.push(item); pushed = true; if (ranked.length >= 24) break; }
      }
      if (!pushed) break;
    }

    const topIds = ranked.map(r => r.pool.id);
    const sideCounts = await prisma.bet.groupBy({
      by: ['poolId', 'side'],
      where: { poolId: { in: topIds } },
      _count: true,
    });
    const sideMap = new Map<string, { upCount: number; downCount: number; drawCount: number }>();
    for (const row of sideCounts) {
      const e = sideMap.get(row.poolId) || { upCount: 0, downCount: 0, drawCount: 0 };
      if (row.side === 'UP') e.upCount = row._count;
      else if (row.side === 'DOWN') e.downCount = row._count;
      else if (row.side === 'DRAW') e.drawCount = row._count;
      sideMap.set(row.poolId, e);
    }

    res.json({
      success: true,
      data: ranked.map(({ pool }) => {
        const c = sideMap.get(pool.id) || { upCount: 0, downCount: 0, drawCount: 0 };
        return { ...serializePool(pool), betCount: pool._count.bets, upCount: c.upCount, downCount: c.downCount, drawCount: c.drawCount };
      }),
    });
  } catch (error) {
    console.error('Error fetching trending pools:', error);
    res.json({ success: true, data: [] });
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

    // Look up the distinct wallets in this slice so we can join displayName /
    // avatarUrl onto each row. The list is capped at 50 so this never grows
    // unbounded and stays a single round-trip.
    const collectWallets = (ws: Array<string | undefined>) => {
      const set = new Set<string>();
      for (const w of ws) if (w) set.add(w);
      return [...set];
    };
    const eventWallets = collectWallets(
      events.map(e => (e.payload as { walletAddress?: string }).walletAddress),
    );

    type UserSlim = { walletAddress: string; displayName: string | null; avatarUrl: string | null };
    const buildIdentityMap = async (wallets: string[]) => {
      if (wallets.length === 0) return new Map<string, UserSlim>();
      const rows = await prisma.user.findMany({
        where: { walletAddress: { in: wallets } },
        select: { walletAddress: true, displayName: true, avatarUrl: true },
      });
      return new Map(rows.map(r => [r.walletAddress, r] as const));
    };
    const eventIdentities = await buildIdentityMap(eventWallets);

    const truncate = (w: string) => `${w.slice(0, 4)}...${w.slice(-4)}`;

    const data = events.map(e => {
      const p = e.payload as { walletAddress?: string; side?: string; amount?: string };
      const w = p.walletAddress || '';
      const u = eventIdentities.get(w);
      return {
        // `wallet` is kept for backwards-compat with anything still reading
        // the pre-truncated label directly. New surfaces should use
        // walletAddress + displayName + avatarUrl and run them through the
        // shared frontend helper.
        wallet: truncate(w),
        walletAddress: w,
        displayName: u?.displayName ?? null,
        avatarUrl: u?.avatarUrl ?? null,
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
      const betIdentities = await buildIdentityMap(collectWallets(bets.map(b => b.walletAddress)));
      return res.json({
        success: true,
        data: bets.map(b => {
          const u = betIdentities.get(b.walletAddress);
          return {
            wallet: truncate(b.walletAddress),
            walletAddress: b.walletAddress,
            displayName: u?.displayName ?? null,
            avatarUrl: u?.avatarUrl ?? null,
            side: b.side,
            amount: b.amount.toString(),
            createdAt: b.createdAt.toISOString(),
          };
        }),
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

// GET /api/pools/:id/livescore - live score for a specific pool's match
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

