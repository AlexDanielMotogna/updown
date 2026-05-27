import cron from 'node-cron';
import { prisma } from '../db';
import { getAdapter } from '../services/sports';
import { polymarketFetch } from '../services/sports/polymarket-fetch';
import { categorizeEvent } from '../services/sports/polymarket-adapter';
import { pickSubcategory, getPolymarketCategories } from '../services/category-config';
import type { MatchResult } from '../services/sports/types';
import { createMatchPools } from './sports-scheduler';

const API_SOURCE = 'predictions';
const RATE_LIMIT_MS = 3_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeJsonParse<T>(str: string | null | undefined): T | null {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

// ── Bulk Sync ───────────────────────────────────────────────────────────────

/**
 * Fetch top events by volume from Polymarket, categorize, and upsert to cache.
 * 1 API call per sync cycle.
 */
export async function bulkSync(): Promise<void> {
  // Fetch per Gamma tag_id (paginated) instead of one global top-100-by-volume
  // page, so each category sees its FULL inventory regardless of what's trending
  // globally. Dedup events by id, then sort by volume so the per-category cap
  // keeps the highest-volume markets.
  const pmCats = await getPolymarketCategories();
  const tagIds = [...new Set(pmCats.flatMap(c => c.tagIds))];
  if (tagIds.length === 0) {
    console.warn('[PolymarketSync] No tagIds configured on any category — skipping bulk sync');
    return;
  }
  const maxPagesPerTag = Number(process.env.POLYMARKET_MAX_PAGES_PER_TAG) || 4;
  const eventsById = new Map<string, any>();
  for (const tagId of tagIds) {
    let offset = 0;
    while (offset < maxPagesPerTag * 100) {
      let page: any = null;
      for (let attempt = 0; attempt < 2 && page === null; attempt++) {
        try {
          page = await polymarketFetch(`/events?closed=false&tag_id=${tagId}&limit=100&offset=${offset}`);
        } catch (error) {
          if (attempt === 0) { await sleep(2_000); continue; } // transient 5xx — retry once
          console.warn(`[PolymarketSync] fetch failed (tag ${tagId} offset ${offset}):`, error instanceof Error ? error.message : error);
        }
      }
      if (!Array.isArray(page) || page.length === 0) break;
      for (const e of page) eventsById.set(String(e.id), e);
      if (page.length < 100) break;
      offset += 100;
    }
  }
  const events = [...eventsById.values()].sort((a, b) => (b.volume24hr ?? 0) - (a.volume24hr ?? 0));
  if (events.length === 0) {
    console.warn('[PolymarketSync] Per-tag fetch returned no events');
    return;
  }

  const counts: Record<string, number> = {};
  // Per-category caps from each category's config (admin-tunable), keyed by code.
  // maxSubmarketsPerEvent defaults to 1 so a multi-market "ladder" (e.g. WTI
  // $110..$150) doesn't flood a category with near-duplicate pools.
  const limits: Record<string, { maxMarkets: number; maxSubmarketsPerEvent: number }> = {};
  for (const c of pmCats) limits[c.code] = { maxMarkets: c.maxMarkets, maxSubmarketsPerEvent: c.maxSubmarketsPerEvent };
  let totalSynced = 0;

  for (const event of events) {
    const cat = await categorizeEvent(event.tags ?? []);
    if (!cat) continue;

    // Volume filter
    if ((event.volume24hr ?? 0) < cat.minVolume24h) continue;

    const lim = limits[cat.code] ?? { maxMarkets: 50, maxSubmarketsPerEvent: 1 };
    const markets = event.markets ?? [];
    if (markets.length === 0) continue;

    // Iterate ALL markets but keep only the first N *valid* ones for this event
    // (skipping inactive/no-price placeholders), so events still contribute even
    // if their first sub-market is a placeholder.
    let perEventSynced = 0;

    for (const market of markets) {
      if (perEventSynced >= lim.maxSubmarketsPerEvent) break;
      if (!market?.id || !market.outcomes || !market.endDate) continue;

      // Skip inactive placeholder markets (e.g. "Player I", "Person P")
      if (market.active === false) continue;

      // Skip markets with no odds (placeholder slots)
      if (!market.outcomePrices) continue;

      // Check per-category cap
      counts[cat.code] = (counts[cat.code] ?? 0);
      if (counts[cat.code] >= lim.maxMarkets) break;

      const outcomes = safeJsonParse<string[]>(market.outcomes);
      if (!outcomes || outcomes.length < 2) continue;

      const endDate = new Date(market.endDate);
      if (isNaN(endDate.getTime())) continue;

      // Skip markets whose end date has already passed
      if (endDate.getTime() < Date.now()) continue;

      // Skip already closed/resolved markets
      if (market.closed) continue;

      // Use market.question (specific) over event.title (generic with __ placeholders)
      const isGenericYesNo = outcomes[0] === 'Yes' && outcomes[1] === 'No';
      const questionTitle = market.question || event.title || 'Prediction';
      const homeTeam = isGenericYesNo ? questionTitle : outcomes[0];
      const awayTeam = isGenericYesNo ? '' : outcomes[1];

      // Market description/rules (prefer market-level, fallback to event-level)
      const description: string | null = market.description || event.description || null;

      // Extract Polymarket odds, group label, CLOB token IDs, and description
      const outcomePrices = safeJsonParse<string[]>(market.outcomePrices);
      const marketOdds = outcomePrices?.length ? parseFloat(outcomePrices[0]) : null;
      const groupItemTitle: string | null = description || market.groupItemTitle || null; // Store description in groupItemTitle for cache
      const clobTokenIds: string | null = market.clobTokenIds || null;
      const tagLabels: string[] = Array.isArray(event.tags)
        ? event.tags.map((t: any) => t.label || t).filter(Boolean)
        : [];
      const tags: string | null = tagLabels.length > 0 ? JSON.stringify(tagLabels) : null;
      // Resolve the single subcategory bucket (exact-match filter key) from the
      // category's ordered whitelist. null when no whitelisted tag is present.
      const subcategory = await pickSubcategory(cat.code, tagLabels);

      // Determine status from Polymarket fields
      let status = 'SCHEDULED';
      if (market.closed && market.umaResolutionStatus === 'resolved') {
        status = 'FINISHED';
      } else if (market.closed) {
        status = 'LIVE'; // closed but not resolved yet = waiting for UMA
      }

      // Virtual scores for resolved markets
      let homeScore: number | null = null;
      let awayScore: number | null = null;
      let winner: string | null = null;

      if (status === 'FINISHED') {
        const prices = safeJsonParse<string[]>(market.outcomePrices);
        if (prices && prices.length >= 2) {
          const p0 = parseFloat(prices[0]);
          const p1 = parseFloat(prices[1]);
          homeScore = p0 > p1 ? 1 : 0;
          awayScore = p0 > p1 ? 0 : 1;
          winner = p0 > p1 ? 'HOME' : 'AWAY';
        }
      }

      try {
        await prisma.sportsFixtureCache.upsert({
          where: {
            externalId_sport_apiSource: {
              externalId: market.id,
              sport: 'POLYMARKET',
              apiSource: API_SOURCE,
            },
          },
          create: {
            externalId: market.id,
            sport: 'POLYMARKET',
            league: cat.code,
            leagueName: cat.name,
            season: null,
            matchday: null,
            homeTeam,
            awayTeam,
            homeTeamCrest: null,
            awayTeamCrest: null,
            kickoff: endDate,
            status,
            homeScore,
            awayScore,
            winner,
            marketOdds,
            groupItemTitle,
            clobTokenIds,
            tags,
            subcategory,
            apiSource: API_SOURCE,
            lastSyncedAt: new Date(),
          },
          update: {
            homeTeam,
            awayTeam,
            kickoff: endDate,
            status,
            homeScore,
            awayScore,
            winner,
            marketOdds,
            groupItemTitle,
            clobTokenIds,
            tags,
            subcategory,
            lastSyncedAt: new Date(),
          },
        });

        counts[cat.code]++;
        totalSynced++;
        perEventSynced++;
      } catch (error) {
        console.warn(`[PolymarketSync] Upsert failed for market ${market.id}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  console.log(`[PolymarketSync] Bulk sync complete: ${totalSynced} markets from ${events.length} events across ${tagIds.length} tags (${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(', ')})`);
}

// ── Re-bucket existing pools ──────────────────────────────────────────────────

/**
 * Re-apply the current categorization to EXISTING PM pools: recompute each pool's
 * `league` (matchPriority) and `subcategory` (pickSubcategory) from its stored tags.
 * Lets admin config changes (new subcategories, priority tweaks) take effect on
 * pools that already exist, instead of only on newly-created ones. Idempotent.
 */
export async function recategorizePmPools(): Promise<{ moved: number; rebucketed: number }> {
  const pools = await prisma.pool.findMany({
    where: { league: { startsWith: 'PM_' } },
    select: { id: true, league: true, tags: true, subcategory: true },
  });
  let moved = 0, rebucketed = 0;
  for (const p of pools) {
    const tags = safeJsonParse<string[]>(p.tags) || [];
    const cat = await categorizeEvent(tags.map(l => ({ label: l })));
    const newLeague = cat?.code ?? p.league!;
    const newSub = await pickSubcategory(newLeague, tags);
    if (newLeague !== p.league || newSub !== p.subcategory) {
      await prisma.pool.update({ where: { id: p.id }, data: { league: newLeague, subcategory: newSub } });
      if (newLeague !== p.league) moved++;
      if (newSub !== p.subcategory) rebucketed++;
    }
  }
  if (moved || rebucketed) console.log(`[PolymarketSync] Re-bucketed PM pools: ${moved} moved category, ${rebucketed} sub-bucket changed`);
  return { moved, rebucketed };
}

// ── Resolution Poll ─────────────────────────────────────────────────────────

/**
 * Check cached Polymarket markets that are past their endDate but not resolved.
 * Polls Gamma API for each to detect UMA resolution.
 */
async function resolutionPoll(): Promise<void> {
  const pending = await prisma.sportsFixtureCache.findMany({
    where: {
      sport: 'POLYMARKET',
      apiSource: API_SOURCE,
      status: { notIn: ['FINISHED', 'CANCELLED'] },
      kickoff: { lte: new Date() }, // past endDate
    },
    select: { externalId: true },
  });

  if (pending.length === 0) return;

  const adapter = getAdapter('POLYMARKET');
  let resolved = 0;

  for (const { externalId } of pending) {
    try {
      const result: MatchResult | null = await adapter.fetchMatchResult(externalId);
      if (!result) continue; // not resolved yet

      const winner = result.winner === 'HOME'
        ? 'HOME'
        : 'AWAY';

      await prisma.sportsFixtureCache.updateMany({
        where: { externalId, sport: 'POLYMARKET', apiSource: API_SOURCE },
        data: {
          status: 'FINISHED',
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          winner,
          lastSyncedAt: new Date(),
        },
      });

      resolved++;
    } catch (error) {
      console.warn(`[PolymarketSync] Resolution poll failed for ${externalId}:`, error instanceof Error ? error.message : error);
    }

    // Rate limit between API calls
    await sleep(RATE_LIMIT_MS);
  }

  if (resolved > 0) {
    console.log(`[PolymarketSync] Resolution poll: resolved ${resolved}/${pending.length} markets`);
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Remove expired/resolved markets from cache and mark expired pools.
 */
async function cleanup(): Promise<void> {
  // Remove expired markets (endDate passed) that aren't resolved
  const { count: expired } = await prisma.sportsFixtureCache.deleteMany({
    where: {
      sport: 'POLYMARKET',
      apiSource: API_SOURCE,
      status: { not: 'FINISHED' },
      kickoff: { lt: new Date() },
    },
  });
  if (expired > 0) {
    console.log(`[PolymarketSync] Cleanup: removed ${expired} expired markets`);
  }

  // Remove old resolved markets (>30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.sportsFixtureCache.deleteMany({
    where: {
      sport: 'POLYMARKET',
      apiSource: API_SOURCE,
      status: 'FINISHED',
      lastSyncedAt: { lt: thirtyDaysAgo },
    },
  });

  if (count > 0) {
    console.log(`[PolymarketSync] Cleanup: removed ${count} old resolved markets`);
  }
}

// ── Scheduler Entry Point ───────────────────────────────────────────────────

let _syncReady = false;

export function isPolymarketSyncReady(): boolean {
  return _syncReady;
}

export function startPolymarketSyncScheduler(): void {
  const syncIntervalHours = Number(process.env.POLYMARKET_SYNC_INTERVAL_HOURS) || 6;
  const pollIntervalMinutes = Number(process.env.POLYMARKET_RESOLUTION_POLL_MINUTES) || 10;

  // Bulk sync on interval
  setInterval(() => {
    bulkSync().catch(e => console.error('[PolymarketSync] Bulk sync error:', e));
  }, syncIntervalHours * 60 * 60 * 1000);

  // Resolution poll on interval
  setInterval(() => {
    resolutionPoll().catch(e => console.error('[PolymarketSync] Resolution poll error:', e));
  }, pollIntervalMinutes * 60 * 1000);

  // Cleanup daily at 05:00 UTC
  cron.schedule('0 5 * * *', () => {
    cleanup().catch(e => console.error('[PolymarketSync] Cleanup error:', e));
  });

  // Seed cache on startup, then trigger pool creation
  bulkSync()
    .then(() => {
      _syncReady = true;
      console.log('[PolymarketSync] Initial sync complete, cache ready — triggering pool creation');
      return createMatchPools();
    })
    .then(() => {
      console.log('[PolymarketSync] Initial pool creation complete');
    })
    .catch(e => {
      console.error('[PolymarketSync] Initial sync/create error:', e);
      _syncReady = true; // mark ready anyway so app doesn't hang
    });

  console.log(`[PolymarketSync] Scheduler started (sync: ${syncIntervalHours}h, poll: ${pollIntervalMinutes}m, cleanup: daily 05:00 UTC)`);
}
