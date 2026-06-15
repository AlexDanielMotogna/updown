import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { createSportsPool } from '../../scheduler/sports-scheduler';
import { syncCategory, getAllLastBulkSyncAt } from '../../scheduler/polymarket-sync';
import { polymarketFetch } from '../../services/sports/polymarket-fetch';
import { getActiveTags, getRelatedTagsForMany } from '../../services/sports/polymarket-tags';
import { getPolymarketCategories } from '../../services/category-config';
import type { Match } from '../../services/sports/types';

/**
 * Admin Polymarket explorer — mirror of sports-explorer for prediction markets.
 *
 * Surfaces:
 *  - PM categories the operator configured + their tagIds + pool/cache counts
 *    + when each was last synced.
 *  - The Gamma `/tags` catalog (cached), annotated with `inUse` so the UI can
 *    hide the Add button for tags already wired to a category.
 *  - Browsable events per tag (with `poolExists` on each market).
 *  - One-click "Create pool" from a cached market.
 *  - Manual `resolve-market` for UMA-stuck markets (mirror of
 *    `resolve-knockout` in sports-explorer).
 *
 * Mounted under `/api/admin/polymarket/`. Auth comes from the parent
 * adminRouter (x-admin-key middleware).
 *
 * See PLAN-ADMIN-REFACTOR.md Phase 4.
 */
// Minimal shapes for the Polymarket Gamma `/events` response — only the fields
// this explorer reads. Upstream JSON is loosely typed, so all are optional.
interface GammaTag {
  id?: string | number;
  label?: string;
  slug?: string;
}
interface GammaMarket {
  id?: string | number;
  question?: string;
  outcomes?: string | null;
  outcomePrices?: string | null;
  endDate?: string | null;
  closed?: boolean;
  active?: boolean;
  image?: string | null;
  icon?: string | null;
}
interface GammaEvent {
  id?: string | number;
  title?: string;
  description?: string | null;
  image?: string | null;
  icon?: string | null;
  volume24hr?: number;
  endDate?: string | null;
  tags?: GammaTag[];
  markets?: GammaMarket[];
}

export const adminPolymarketRouter: RouterType = Router();

// ── GET /admin/polymarket/categories ─────────────────────────────────────
// Single round-trip: cat config + pool/cache counts + last bulk sync.
adminPolymarketRouter.get('/categories', async (_req, res) => {
  try {
    const cats = await getPolymarketCategories();

    // Pool + cached-market counts in one query each, then bucket by code so
    // the response can stay O(cats). Pools count anything that points at a
    // PM category via `league`; cache count uses fixtureCache.league.
    const [poolCounts, cacheCounts] = await Promise.all([
      prisma.pool.groupBy({
        by: ['league'],
        where: { league: { in: cats.map(c => c.code) } },
        _count: { league: true },
      }),
      prisma.sportsFixtureCache.groupBy({
        by: ['league'],
        where: { sport: 'POLYMARKET', league: { in: cats.map(c => c.code) } },
        _count: { league: true },
      }),
    ]);

    const poolByCode = new Map(poolCounts.map(r => [r.league, r._count.league]));
    const cacheByCode = new Map(cacheCounts.map(r => [r.league, r._count.league]));
    const lastSyncs = getAllLastBulkSyncAt();

    const data = cats.map(c => ({
      code: c.code,
      label: c.name,
      tagIds: c.tagIds,
      tags: c.tags,
      minVolume24h: c.minVolume24h,
      maxDaysAhead: c.maxDaysAhead,
      maxMarkets: c.maxMarkets,
      maxSubmarketsPerEvent: c.maxSubmarketsPerEvent,
      matchPriority: c.matchPriority,
      poolCount: poolByCode.get(c.code) ?? 0,
      cachedMarketCount: cacheByCode.get(c.code) ?? 0,
      lastBulkSyncAt: lastSyncs[c.code] ? new Date(lastSyncs[c.code]).toISOString() : null,
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('[AdminPolymarket] categories error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── GET /admin/polymarket/tags ───────────────────────────────────────────
// Active Gamma tag catalog (cached 1h via getActiveTags). Annotated with
// `inUse: true + categoryCode` when the tag id is already wired to one of
// our categories so the UI can hide the Add button.
adminPolymarketRouter.get('/tags', async (_req, res) => {
  try {
    const [tags, cats] = await Promise.all([
      getActiveTags(),
      getPolymarketCategories(),
    ]);
    const tagIdToCategory = new Map<string, string>();
    for (const c of cats) {
      for (const tid of c.tagIds) tagIdToCategory.set(String(tid), c.code);
    }
    const data = tags.map(t => ({
      id: t.id,
      label: t.label,
      slug: t.slug,
      count: t.count,
      inUse: tagIdToCategory.has(String(t.id)),
      categoryCode: tagIdToCategory.get(String(t.id)) ?? null,
    }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('[AdminPolymarket] tags error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── GET /admin/polymarket/related-tags?tagIds=… ──────────────────────────
// PM's own ranked sub-tags for a parent tag (used by the admin to populate
// the subcategory whitelist from real PM data, not free-text).
adminPolymarketRouter.get('/related-tags', async (req, res) => {
  try {
    const tagIds = String(req.query.tagIds || '').split(',').map(s => s.trim()).filter(Boolean);
    if (tagIds.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tagIds query param required' } });
    }
    const data = await getRelatedTagsForMany(tagIds);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[AdminPolymarket] related-tags error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── GET /admin/polymarket/events?tag=X&days=N ────────────────────────────
// Browse Gamma `/events` for one tag, surfaced for the operator's "I want
// to add this market" UX. Each market is annotated with `poolExists: true`
// when we already have a Pool for that market id, so the UI can hide the
// "Create pool" button.
adminPolymarketRouter.get('/events', async (req, res) => {
  try {
    const tagId = String(req.query.tag || '').trim();
    if (!tagId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: '?tag=<tagId> required' } });
    }
    const days = Math.max(1, Math.min(180, Number(req.query.days) || 30));
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));

    const events = await polymarketFetch<GammaEvent[]>(`/events?closed=false&tag_id=${tagId}&limit=${limit}`);
    const horizon = Date.now() + days * 24 * 60 * 60 * 1000;

    // Collect all market ids so we can answer poolExists in one query.
    const marketIds: string[] = [];
    for (const ev of events ?? []) {
      for (const m of ev.markets ?? []) {
        if (m?.id) marketIds.push(String(m.id));
      }
    }
    const existingPools = marketIds.length === 0 ? [] : await prisma.pool.findMany({
      where: { matchId: { in: marketIds }, poolType: 'POLYMARKET' },
      select: { matchId: true, id: true, status: true },
    });
    const poolByMatchId = new Map(existingPools.map(p => [p.matchId, p]));

    const data = (events ?? []).map((ev: GammaEvent) => {
      const tags = (ev.tags || []).map((t: GammaTag) => ({ id: String(t.id), label: t.label, slug: t.slug }));
      const markets = (ev.markets || [])
        .filter((m: GammaMarket) => m?.id && m.outcomes && m.endDate)
        .filter((m: GammaMarket) => new Date(m.endDate as string).getTime() <= horizon)
        .map((m: GammaMarket) => {
          const existing = poolByMatchId.get(String(m.id));
          return {
            id: String(m.id),
            question: m.question,
            endDate: m.endDate,
            outcomes: safeParseArray(m.outcomes),
            outcomePrices: safeParseArray(m.outcomePrices),
            closed: !!m.closed,
            active: m.active !== false,
            image: m.image ?? m.icon ?? null,
            poolExists: !!existing,
            poolId: existing?.id ?? null,
            poolStatus: existing?.status ?? null,
          };
        });

      return {
        id: String(ev.id),
        title: ev.title,
        description: ev.description ?? null,
        image: ev.image ?? ev.icon ?? null,
        volume24hr: ev.volume24hr ?? 0,
        endDate: ev.endDate,
        tags,
        markets,
      };
    }).filter((e: { markets: Array<unknown> }) => e.markets.length > 0);

    res.json({ success: true, data });
  } catch (error) {
    console.error('[AdminPolymarket] events error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── GET /admin/polymarket/markets?category=X ────────────────────────────
// Cached PM markets for ONE category — the right-pane table on the admin
// PM Explorer. Mirror of sports-explorer's /matches endpoint.
adminPolymarketRouter.get('/markets', async (req, res) => {
  try {
    const code = String(req.query.category || '').trim();
    if (!code) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: '?category=<code> required' } });
    }
    const status = String(req.query.status || 'upcoming').toLowerCase();

    const where: { sport: 'POLYMARKET'; league: string; kickoff?: { gte?: Date; lt?: Date } } = { sport: 'POLYMARKET', league: code };
    if (status === 'upcoming') where.kickoff = { gte: new Date() };
    else if (status === 'past') where.kickoff = { lt: new Date() };

    const rows = await prisma.sportsFixtureCache.findMany({
      where,
      orderBy: { kickoff: status === 'past' ? 'desc' : 'asc' },
      take: 200,
    });

    // Annotate with poolExists in one query.
    const ids = rows.map(r => r.externalId);
    const pools = ids.length === 0 ? [] : await prisma.pool.findMany({
      where: { matchId: { in: ids }, poolType: 'POLYMARKET' },
      select: { matchId: true, id: true, status: true },
    });
    const poolByMatchId = new Map(pools.map(p => [p.matchId, p]));

    const data = rows.map(r => {
      const pool = poolByMatchId.get(r.externalId);
      return {
        externalId: r.externalId,
        question: r.homeTeam, // PM cache stores question in homeTeam (see polymarket-sync)
        opponent: r.awayTeam || null,
        image: r.homeTeamCrest ?? null,
        endDate: r.kickoff.toISOString(),
        status: r.status,
        subcategory: r.subcategory ?? null,
        marketOdds: r.marketOdds ?? null,
        poolExists: !!pool,
        poolId: pool?.id ?? null,
        poolStatus: pool?.status ?? null,
        lastSyncedAt: r.lastSyncedAt.toISOString(),
      };
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('[AdminPolymarket] markets error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── POST /admin/polymarket/refresh-category ──────────────────────────────
// Bypass the 6h cron and sync ONE category now. Mirror of sports-explorer's
// /refresh-league.
adminPolymarketRouter.post('/refresh-category', async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim();
    if (!code) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'code required' } });
    }
    const r = await syncCategory(code);
    res.json({ success: true, data: r });
  } catch (error) {
    console.error('[AdminPolymarket] refresh-category error:', error);
    res.status(400).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── POST /admin/polymarket/create-pool ───────────────────────────────────
// One-click "spin up a pool for this market" path. Mirror of sports-
// explorer's /create-pool. Reads the cached fixture row, refuses duplicates,
// and emits an ADMIN_CREATE_PM_POOL audit event.
const createBody = z.object({
  matchId: z.string().min(1),
  category: z.string().min(1),
});
adminPolymarketRouter.post('/create-pool', async (req, res) => {
  try {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body' } });
    }
    const { matchId, category } = parsed.data;

    const existing = await prisma.pool.findFirst({
      where: { matchId, poolType: 'POLYMARKET' },
      select: { id: true, status: true },
    });
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'POOL_EXISTS', message: `Pool already exists (id=${existing.id}, status=${existing.status})` } });
    }

    const cat = await prisma.poolCategory.findUnique({ where: { code: category } });
    if (!cat) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } });
    if (cat.type !== 'POLYMARKET') {
      return res.status(400).json({ success: false, error: { code: 'CATEGORY_TYPE_MISMATCH', message: `Category ${category} is type=${cat.type}, expected POLYMARKET` } });
    }

    const cacheRow = await prisma.sportsFixtureCache.findFirst({
      where: { externalId: matchId, sport: 'POLYMARKET', league: category },
    });
    if (!cacheRow) {
      return res.status(404).json({ success: false, error: { code: 'MATCH_NOT_CACHED', message: 'Market not found in fixture cache. Try Refresh this category first.' } });
    }

    const match: Match = {
      id: cacheRow.externalId,
      sport: 'POLYMARKET',
      league: cat.code,
      leagueName: cacheRow.leagueName ?? cat.label,
      homeTeam: cacheRow.homeTeam,
      awayTeam: cacheRow.awayTeam,
      homeTeamCrest: cacheRow.homeTeamCrest ?? undefined,
      awayTeamCrest: cacheRow.awayTeamCrest ?? undefined,
      kickoff: cacheRow.kickoff,
      status: cacheRow.status as Match['status'],
      rawStatus: cacheRow.status,
      homeScore: cacheRow.homeScore ?? undefined,
      awayScore: cacheRow.awayScore ?? undefined,
    };

    const poolId = await createSportsPool(match, cat.code);
    if (!poolId) {
      return res.status(500).json({ success: false, error: { code: 'CREATE_FAILED', message: 'Pool creation failed — check server logs' } });
    }

    // ADMIN_CREATE_PM_POOL event (Plan §Phase 4). Best-effort; the route
    // succeeds even if the audit row fails to write.
    await prisma.eventLog.create({
      data: {
        eventType: 'ADMIN_CREATE_PM_POOL',
        entityType: 'pool',
        entityId: poolId,
        payload: {
          matchId,
          category,
          question: cacheRow.homeTeam,
          endDate: cacheRow.kickoff.toISOString(),
        },
      },
    }).catch(() => {});

    res.json({ success: true, data: { poolId, matchId, category } });
  } catch (error) {
    console.error('[AdminPolymarket] create-pool error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── POST /admin/polymarket/resolve-market ────────────────────────────────
// Admin-supplied UMA-stuck resolution. Mirror of `resolve-knockout` for
// football — the cached PM market is marked FINISHED with the operator's
// winner, and the pool advances to CLAIMABLE so winners can claim. The
// on-chain resolve still needs to happen via the standard /actions/resolve-
// pool path; this endpoint is the DB / cache side only.
const resolveBody = z.object({
  poolId: z.string().min(1),
  winner: z.enum(['HOME', 'AWAY']),
  reason: z.string().max(280).optional(),
});
adminPolymarketRouter.post('/resolve-market', async (req, res) => {
  try {
    const parsed = resolveBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body' } });
    }
    const { poolId, winner, reason } = parsed.data;

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pool not found' } });
    if (pool.poolType !== 'POLYMARKET' && !pool.league?.startsWith('PM_')) {
      // Loose check — PM categories almost always start with PM_, but we
      // also accept any pool whose category is POLYMARKET via a follow-up
      // lookup so the operator isn't blocked by a non-conventional code.
      const cat = pool.league ? await prisma.poolCategory.findUnique({ where: { code: pool.league } }) : null;
      if (!cat || cat.type !== 'POLYMARKET') {
        return res.status(400).json({ success: false, error: { code: 'NOT_PM_POOL', message: 'This endpoint only resolves Polymarket pools' } });
      }
    }
    if (pool.status === 'CLAIMABLE' || pool.status === 'RESOLVED') {
      return res.status(409).json({ success: false, error: { code: 'ALREADY_RESOLVED', message: `Pool is already ${pool.status}` } });
    }

    // Pool.winner is the Side enum (UP / DOWN / DRAW); PM cache uses
    // HOME / AWAY semantics. Convention here matches the football
    // resolve-knockout helper: HOME → UP, AWAY → DOWN.
    const winnerLabel = winner === 'HOME' ? 'UP' : 'DOWN';

    await prisma.pool.update({
      where: { id: pool.id },
      data: {
        status: 'CLAIMABLE',
        winner: winnerLabel,
        finalPrice: BigInt(0),
      },
    });
    await prisma.sportsFixtureCache.updateMany({
      where: { externalId: pool.matchId ?? '', sport: 'POLYMARKET' },
      data: {
        status: 'FINISHED',
        winner,
        lastSyncedAt: new Date(),
      },
    }).catch(() => {});

    await prisma.eventLog.create({
      data: {
        eventType: 'ADMIN_RESOLVE_PM_POOL',
        entityType: 'pool',
        entityId: pool.id,
        payload: {
          category: pool.league,
          winner,
          reason: reason ?? 'admin-pm-uma-stuck-resolve',
          note: 'PM pool manually resolved by admin (UMA stalled or market delisted from Gamma).',
        },
      },
    }).catch(() => {});

    res.json({ success: true, data: { poolId: pool.id, winner, sideLabel: winnerLabel } });
  } catch (error) {
    console.error('[AdminPolymarket] resolve-market error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

function safeParseArray(s: string | null | undefined): string[] | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : null;
  } catch {
    return null;
  }
}
