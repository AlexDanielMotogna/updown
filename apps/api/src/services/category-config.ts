import { prisma } from '../db';
import type { SportsDbConfig } from './sports/api-sports-adapter';
import { CATEGORY_DEFAULTS, seedCategories } from './category-defaults';

export interface PoolCategoryConfig {
  code: string;
  type: string;
  enabled: boolean;
  comingSoon: boolean;
  label: string;
  shortLabel: string | null;
  color: string | null;
  badgeUrl: string | null;
  iconKey: string | null;
  apiSource: string | null;
  adapterKey: string | null;
  numSides: number;
  sideLabels: string[];
  config: Record<string, unknown> | null;
  sortOrder: number;
}

// ── In-memory fallback, derived from the single canonical default list ──────
// Used only until the DB (poolCategory) is populated (auto-seeded on boot).

const FALLBACK: PoolCategoryConfig[] = CATEGORY_DEFAULTS.map(c => ({
  code: c.code,
  type: c.type,
  enabled: c.enabled,
  comingSoon: c.comingSoon,
  label: c.label,
  shortLabel: c.shortLabel ?? null,
  color: c.color ?? null,
  badgeUrl: c.badgeUrl ?? null,
  iconKey: c.iconKey ?? null,
  apiSource: c.apiSource ?? null,
  adapterKey: c.adapterKey ?? null,
  numSides: c.numSides,
  sideLabels: c.sideLabels,
  config: c.config ?? null,
  sortOrder: c.sortOrder,
}));

// ── In-memory cache ─────────────────────────────────────────────────────────

let cachedCategories: PoolCategoryConfig[] = FALLBACK;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 60_000;

function mapRow(row: any): PoolCategoryConfig {
  return {
    code: row.code,
    type: row.type,
    enabled: row.enabled,
    comingSoon: row.comingSoon,
    label: row.label,
    shortLabel: row.shortLabel,
    color: row.color,
    badgeUrl: row.badgeUrl,
    iconKey: row.iconKey,
    apiSource: row.apiSource,
    adapterKey: row.adapterKey,
    numSides: row.numSides,
    sideLabels: row.sideLabels,
    config: row.config as Record<string, unknown> | null,
    sortOrder: row.sortOrder,
  };
}

async function refreshCache(): Promise<void> {
  if (Date.now() - lastFetchedAt < CACHE_TTL_MS) return;
  try {
    const rows = await prisma.poolCategory.findMany({ orderBy: { sortOrder: 'asc' } });
    if (rows.length > 0) {
      cachedCategories = rows.map(mapRow);
      lastFetchedAt = Date.now();
    }
  } catch (err) {
    console.warn('[CategoryConfig] DB read failed, using cached/fallback');
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getAllCategories(): Promise<PoolCategoryConfig[]> {
  await refreshCache();
  return cachedCategories;
}

export async function getEnabledCategories(type?: string): Promise<PoolCategoryConfig[]> {
  await refreshCache();
  const enabled = cachedCategories.filter(c => c.enabled);
  return type ? enabled.filter(c => c.type === type) : enabled;
}

export async function getVisibleCategories(): Promise<PoolCategoryConfig[]> {
  await refreshCache();
  return cachedCategories.filter(c => c.enabled || c.comingSoon);
}

export async function getFootballLeagueCodes(): Promise<string[]> {
  const cats = await getEnabledCategories('FOOTBALL_LEAGUE');
  return cats.map(c => c.code);
}

export async function getSportsDbConfigs(): Promise<SportsDbConfig[]> {
  const cats = await getEnabledCategories('SPORTSDB_SPORT');
  return cats.map(c => ({
    sport: c.code,
    sportQuery: (c.config as any)?.sportQuery || c.code,
    numSides: c.numSides,
    sideLabels: c.sideLabels,
    leagueFilter: (c.config as any)?.leagueFilter || c.code,
    leagueId: (c.config as any)?.externalLeagueId,
  }));
}

/** Get football league configs for TheSportsDB adapter. */
export async function getFootballConfigs(): Promise<SportsDbConfig[]> {
  const cats = await getEnabledCategories('FOOTBALL_LEAGUE');
  return cats
    .filter(c => (c.config as any)?.externalLeagueId) // only leagues with a TheSportsDB ID
    .map(c => ({
      sport: c.code,         // CL, PL, EL, etc. — used as adapter key
      sportQuery: 'Soccer',
      numSides: c.numSides,
      sideLabels: c.sideLabels,
      leagueId: (c.config as any).externalLeagueId,
    }));
}

export interface PolymarketCategoryConfig {
  code: string;
  name: string;
  tags: string[];
  tagIds: string[];
  minVolume24h: number;
  maxDaysAhead: number;
  matchPriority: number;
  maxMarkets: number;
  maxSubmarketsPerEvent: number;
}

export async function getPolymarketCategories(): Promise<PolymarketCategoryConfig[]> {
  const cats = await getEnabledCategories('POLYMARKET');
  return cats
    .map(c => ({
      code: c.code,
      name: c.label,
      tags: (c.config as any)?.tags || [],
      // Gamma API tag_ids for direct per-tag fetch (full inventory, not the
      // global top-100-by-volume). Resolve via /tags/slug/{slug} if you add tags.
      tagIds: ((c.config as any)?.tagIds || []).map((t: any) => String(t)),
      minVolume24h: (c.config as any)?.minVolume24h || 5000,
      maxDaysAhead: (c.config as any)?.maxDaysAhead || 90,
      // Lower = matched first. Defaults to sortOrder; set high for the generic
      // "Politics" catch-all so specific categories (Geo, Finance, ...) win when
      // an event carries both a specific tag AND the broad "Politics" tag.
      matchPriority: (c.config as any)?.matchPriority ?? c.sortOrder,
      // Per-category import caps (admin-tunable). Default to the legacy globals.
      maxMarkets: (c.config as any)?.maxMarkets || 50,
      maxSubmarketsPerEvent: (c.config as any)?.maxSubmarketsPerEvent || 1,
    }))
    .sort((a, b) => a.matchPriority - b.matchPriority);
}

/**
 * Operational / non-topic Polymarket tags that should never be offered as
 * subcategories (promo buckets, scheduling labels, internal flags). Used to
 * keep admin suggestions clean. Matching is case-insensitive.
 */
export const OPERATIONAL_PM_TAGS = new Set<string>([
  'earn 4%', 'monthly', 'weekly', 'daily', 'recurring', 'hit price',
  'hide from new', 'finance updown', 'pyth finance', '2025 predictions',
  'breaking news', '10-point', 'main election', 'new', 'all', 'featured',
  'trending', 'live',
]);

/** True if a raw Polymarket tag is an operational/non-topic tag. */
export function isOperationalTag(tag: string): boolean {
  return OPERATIONAL_PM_TAGS.has(tag.trim().toLowerCase());
}

/** Ordered subcategory whitelist for a PM category code (priority order). */
export async function getCategorySubcategories(code: string): Promise<string[]> {
  await refreshCache();
  const cat = cachedCategories.find(c => c.code === code);
  const subs = (cat?.config as any)?.subcategories;
  return Array.isArray(subs) ? subs.filter((s): s is string => typeof s === 'string') : [];
}

/**
 * Resolve a single subcategory bucket for a pool from its raw event tags.
 * Returns the FIRST entry of the category's ordered subcategory whitelist that
 * appears in the event tags (case-insensitive), or null if none match. This is
 * what makes each sidebar filter map to a distinct set of pools.
 */
export async function pickSubcategory(code: string, eventTags: string[]): Promise<string | null> {
  const subs = await getCategorySubcategories(code);
  if (subs.length === 0) return null;
  const tagSet = new Set(eventTags.map(t => t.trim().toLowerCase()));
  for (const sub of subs) {
    if (isOperationalTag(sub)) continue; // never bucket by an operational/non-topic tag, even if it slipped into the whitelist
    if (tagSet.has(sub.trim().toLowerCase())) return sub;
  }
  return null;
}

/** Tags from disabled/comingSoon PM categories — used to reject miscategorized events. */
export async function getDisabledPolymarketTags(): Promise<Set<string>> {
  await refreshCache();
  const disabled = cachedCategories.filter(c => c.type === 'POLYMARKET' && !c.enabled);
  const tags = new Set<string>();
  for (const c of disabled) {
    for (const t of (c.config as any)?.tags || []) tags.add(t);
  }
  return tags;
}

const DEFAULT_MATCH_DURATION_HOURS = 4; // fallback if not configured

/** Get the match duration in hours for a given category code. */
export async function getMatchDurationHours(leagueCode: string): Promise<number> {
  await refreshCache();
  const cat = cachedCategories.find(c => c.code === leagueCode);
  return (cat?.config as any)?.matchDurationHours ?? DEFAULT_MATCH_DURATION_HOURS;
}

export function invalidateCache(): void {
  lastFetchedAt = 0;
}

/**
 * Seed the poolCategory table from the canonical defaults IF it's empty.
 * Run once on boot so a fresh DB becomes admin-driven immediately (no more
 * "empty table silently runs on the hardcoded fallback" footgun). Idempotent.
 */
export async function seedCategoriesIfEmpty(): Promise<void> {
  try {
    const n = await prisma.poolCategory.count();
    if (n > 0) return;
    const count = await seedCategories(prisma);
    invalidateCache();
    console.log(`[CategoryConfig] poolCategory was empty — auto-seeded ${count} categories`);
  } catch (err) {
    console.warn('[CategoryConfig] auto-seed skipped:', err instanceof Error ? err.message : err);
  }
}
