import { Router, type Router as RouterType } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db';
import { invalidateCache } from '../../services/category-config';
import { refreshAllAdapters } from '../../services/sports';
import { invalidateSportLeagueWhitelist } from '../../scheduler/fixture-sync';

/**
 * Drop all in-memory caches that key off the category config:
 *  - SportsDbAdapter cache (services/sports) — picks up new sportQuery /
 *    leagueFilter / leagueId.
 *  - fixture-sync SPORT_LEAGUE_WHITELIST cache — picks up new codes so
 *    the upsert guard accepts the new category.
 *
 * Called after any mutation that could change adapter behaviour or the
 * valid (sport, league) set (POST/PUT/DELETE/toggle/coming-soon on
 * FOOTBALL_LEAGUE or SPORTSDB_SPORT categories). Fire-and-forget on the
 * adapter refresh — a stale adapter for one tick is better than failing
 * the mutation if the refresh stumbles.
 */
function rebuildAdapters(): void {
  invalidateSportLeagueWhitelist();
  refreshAllAdapters().catch(err => {
    console.warn('[admin-categories] adapter refresh failed:', err instanceof Error ? err.message : err);
  });
}

export const adminCategoriesRouter: RouterType = Router();

/**
 * Map a thrown error to a known error code + safe public message. Avoids
 * leaking Prisma internals (e.g. table names, internal constraint identifiers)
 * to the client. Raw error stays in stderr for diagnostics.
 * See PLAN-ADMIN-REFACTOR.md Phase 1 #17.
 */
function safeErrorResponse(action: string, err: unknown): { status: number; body: { success: false; error: { code: string; message: string } } } {
  console.error(`[admin-categories] ${action} failed:`, err);
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return { status: 409, body: { success: false, error: { code: 'DUPLICATE', message: 'A category with this code already exists' } } };
    if (err.code === 'P2025') return { status: 404, body: { success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } } };
    if (err.code === 'P2003') return { status: 409, body: { success: false, error: { code: 'FK_CONSTRAINT', message: 'Action blocked by a database constraint' } } };
  }
  return { status: 400, body: { success: false, error: { code: action.toUpperCase().replace(/-/g, '_') + '_ERROR', message: 'Operation failed' } } };
}

// Zod allowlist of category fields the admin can write. Anything else in
// req.body (including id/createdAt/updatedAt) is stripped. Strict mode would
// 400 on unknown keys; we use passthrough-strip via .strip() to be forgiving
// with the existing UI which sends a wide payload. See Phase 1 #10.
const categoryBaseSchema = z.object({
  code: z.string().min(2).max(32).regex(/^[A-Z][A-Z0-9_]+$/, 'Code must be uppercase A-Z, digits, or underscore'),
  type: z.enum(['FOOTBALL_LEAGUE', 'SPORTSDB_SPORT', 'POLYMARKET']),
  enabled: z.boolean(),
  comingSoon: z.boolean(),
  label: z.string().min(1).max(80),
  shortLabel: z.string().max(40).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be #RRGGBB hex').nullable().optional(),
  badgeUrl: z.string().url().nullable().optional(),
  iconKey: z.string().max(40).nullable().optional(),
  apiSource: z.string().max(40).nullable().optional(),
  adapterKey: z.string().max(40).nullable().optional(),
  numSides: z.number().int().min(2).max(3),
  sideLabels: z.array(z.string()).min(2).max(3),
  config: z.record(z.unknown()).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999),
});
const createCategorySchema = categoryBaseSchema;
const updateCategorySchema = categoryBaseSchema.partial();

/**
 * Cross-field check: SDB-backed categories must carry a TheSportsDB
 * `externalLeagueId` in their config, otherwise the daily-sync falls back
 * to `eventsday.php?s=<sportQuery>` which (historically) contaminated the
 * cache with the wrong sport. Polymarket has its own path (tagIds).
 *
 * For PUT we only enforce if the incoming payload sets type or config —
 * a 'change-only-the-label' edit shouldn't break because of legacy state.
 */
function assertExternalLeagueId(
  type: string | undefined,
  config: Record<string, unknown> | null | undefined,
  required: boolean,
): { ok: true } | { ok: false; message: string } {
  if (!required) return { ok: true };
  if (type !== 'FOOTBALL_LEAGUE' && type !== 'SPORTSDB_SPORT') return { ok: true };
  const eid = config && typeof config === 'object'
    ? (config as Record<string, unknown>).externalLeagueId ?? (config as Record<string, unknown>).theSportsDbLeagueId
    : undefined;
  if (typeof eid === 'string' && eid.trim().length > 0) return { ok: true };
  return { ok: false, message: `${type} categories require config.externalLeagueId (the TheSportsDB league id). Browse SDB in admin → Matches to find it.` };
}

// GET /api/admin/categories - all categories (including disabled)
adminCategoriesRouter.get('/', async (_req, res) => {
  try {
    const categories = await prisma.poolCategory.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, data: categories });
  } catch (err) {
    const { status, body } = safeErrorResponse('fetch', err);
    res.status(status).json(body);
  }
});

// Prisma's JSON columns can't accept a raw `null` — explicit nulls have to
// be passed as `Prisma.JsonNull`. We let the zod schema allow `null` on
// `config` for ergonomics and translate here.
function normalizeConfig<T extends { config?: Record<string, unknown> | null }>(data: T): Omit<T, 'config'> & { config?: Prisma.InputJsonValue | typeof Prisma.JsonNull } {
  const { config, ...rest } = data;
  if (config === undefined) return rest as Omit<T, 'config'>;
  if (config === null) return { ...rest, config: Prisma.JsonNull } as Omit<T, 'config'> & { config: typeof Prisma.JsonNull };
  return { ...rest, config: config as Prisma.InputJsonValue };
}

// POST /api/admin/categories - create new category
adminCategoriesRouter.post('/', async (req, res) => {
  try {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid category fields', details: parsed.error.flatten() } });
    }
    // Always enforce on create — no legacy excuse here.
    const guard = assertExternalLeagueId(parsed.data.type, parsed.data.config, true);
    if (!guard.ok) {
      return res.status(400).json({ success: false, error: { code: 'EXTERNAL_LEAGUE_ID_REQUIRED', message: guard.message } });
    }
    const category = await prisma.poolCategory.create({ data: normalizeConfig(parsed.data) });
    invalidateCache();
    rebuildAdapters();
    res.json({ success: true, data: category });
  } catch (err) {
    const { status, body } = safeErrorResponse('create', err);
    res.status(status).json(body);
  }
});

// PUT /api/admin/categories/:id - update category
adminCategoriesRouter.put('/:id', async (req, res) => {
  try {
    const parsed = updateCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid category fields', details: parsed.error.flatten() } });
    }
    // Only enforce when the payload actually changes type or config —
    // a label-only edit of a legacy category without an id shouldn't be
    // gated by a guard the operator can't satisfy in this request.
    const touchesShape = parsed.data.type !== undefined || parsed.data.config !== undefined;
    if (touchesShape) {
      const existing = await prisma.poolCategory.findUnique({ where: { id: req.params.id }, select: { type: true, config: true } });
      const nextType = parsed.data.type ?? existing?.type;
      const nextConfig = parsed.data.config ?? (existing?.config as Record<string, unknown> | null | undefined);
      const guard = assertExternalLeagueId(nextType, nextConfig, true);
      if (!guard.ok) {
        return res.status(400).json({ success: false, error: { code: 'EXTERNAL_LEAGUE_ID_REQUIRED', message: guard.message } });
      }
    }
    const category = await prisma.poolCategory.update({
      where: { id: req.params.id },
      data: normalizeConfig(parsed.data),
    });
    invalidateCache();
    rebuildAdapters();
    res.json({ success: true, data: category });
  } catch (err) {
    const { status, body } = safeErrorResponse('update', err);
    res.status(status).json(body);
  }
});

// PATCH /api/admin/categories/:id/toggle - enable/disable
adminCategoriesRouter.patch('/:id/toggle', async (req, res) => {
  try {
    const current = await prisma.poolCategory.findUnique({ where: { id: req.params.id } });
    if (!current) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } });
    }

    const category = await prisma.poolCategory.update({
      where: { id: req.params.id },
      data: { enabled: !current.enabled },
    });
    invalidateCache();
    rebuildAdapters();
    res.json({ success: true, data: category });
  } catch (err) {
    const { status, body } = safeErrorResponse('toggle', err);
    res.status(status).json(body);
  }
});

// PATCH /api/admin/categories/:id/coming-soon - toggle comingSoon
adminCategoriesRouter.patch('/:id/coming-soon', async (req, res) => {
  try {
    const current = await prisma.poolCategory.findUnique({ where: { id: req.params.id } });
    if (!current) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } });
    }

    const category = await prisma.poolCategory.update({
      where: { id: req.params.id },
      data: { comingSoon: !current.comingSoon },
    });
    invalidateCache();
    rebuildAdapters();
    res.json({ success: true, data: category });
  } catch (err) {
    const { status, body } = safeErrorResponse('toggle', err);
    res.status(status).json(body);
  }
});

// DELETE /api/admin/categories/:id
// Refuses to delete a category that still has live pools — Pool.league is a
// free-form string column, so a delete would orphan the rows visually
// (pools lose their category in the UI) without any FK cascade to clean
// them up. Admin must drain or migrate the pools first. See Phase 1 #10.
adminCategoriesRouter.delete('/:id', async (req, res) => {
  try {
    const category = await prisma.poolCategory.findUnique({ where: { id: req.params.id } });
    if (!category) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } });
    }
    const livePoolCount = await prisma.pool.count({
      where: {
        league: category.code,
        status: { in: ['JOINING', 'ACTIVE', 'RESOLVED', 'CLAIMABLE'] },
      },
    });
    if (livePoolCount > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CATEGORY_HAS_POOLS',
          message: `Cannot delete: ${livePoolCount} active pool(s) still reference this category. Disable it instead, or wait for the pools to fully close.`,
        },
      });
    }
    await prisma.poolCategory.delete({ where: { id: req.params.id } });
    invalidateCache();
    rebuildAdapters();
    res.json({ success: true });
  } catch (err) {
    const { status, body } = safeErrorResponse('delete', err);
    res.status(status).json(body);
  }
});
