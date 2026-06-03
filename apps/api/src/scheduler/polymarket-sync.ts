import cron from 'node-cron';
import { prisma } from '../db';
import { polymarketFetch } from '../services/sports/polymarket-fetch';
import { categorizeEvent } from '../services/sports/polymarket-adapter';
import { pickSubcategory, getPolymarketCategories } from '../services/category-config';
import { readUmaQuestion } from '../services/polymarket/uma-resolver';
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

/**
 * Normalise the UMA questionID from a Gamma market response into the
 * 0x-prefixed lowercase bytes32 hex the UmaCtfAdapter expects. Rejects
 * anything that isn't a 32-byte hex value — Polymarket occasionally
 * returns empty strings for admin-resolved specials, and we'd rather
 * persist NULL than poison the column with a malformed value that
 * uma-resolver would later try to query.
 */
function normalizeQuestionId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withPrefix = trimmed.toLowerCase().startsWith('0x') ? trimmed.toLowerCase() : `0x${trimmed.toLowerCase()}`;
  // bytes32 = 0x + 64 hex chars = 66 total
  if (withPrefix.length !== 66) return null;
  if (!/^0x[0-9a-f]{64}$/.test(withPrefix)) return null;
  return withPrefix;
}

// ── lastBulkSyncAt tracking ────────────────────────────────────────────────
// In-process record of when the last successful sync touched each category.
// Powers the admin "Last synced …" label without needing a DB column. Cleared
// on restart, which is fine — admins know how long the API has been up via
// the System Health tab. See PLAN-ADMIN-REFACTOR.md Phase 4.
const _lastBulkSyncAtByCode = new Map<string, number>();
export function getLastBulkSyncAt(code: string): number | null {
  return _lastBulkSyncAtByCode.get(code) ?? null;
}
export function getAllLastBulkSyncAt(): Record<string, number> {
  return Object.fromEntries(_lastBulkSyncAtByCode);
}
function recordSync(code: string): void {
  _lastBulkSyncAtByCode.set(code, Date.now());
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
    console.warn('[PolymarketSync] No tagIds configured on any category - skipping bulk sync');
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
          if (attempt === 0) { await sleep(2_000); continue; } // transient 5xx - retry once
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
      // Polymarket image for the pool badge - prefer the specific market image,
      // fall back to the event image. Stored as homeTeamCrest (the pool badge field).
      const crest: string | null = market.image || market.icon || event.image || event.icon || null;
      const tagLabels: string[] = Array.isArray(event.tags)
        ? event.tags.map((t: any) => t.label || t).filter(Boolean)
        : [];
      const tags: string | null = tagLabels.length > 0 ? JSON.stringify(tagLabels) : null;
      // Resolve the single subcategory bucket (exact-match filter key) from the
      // category's ordered whitelist. null when no whitelisted tag is present.
      const subcategory = await pickSubcategory(cat.code, tagLabels);
      // UMA questionID — bytes32 key Polymarket registers with UmaCtfAdapter
      // on Polygon. Persisted so services/polymarket/uma-resolver.ts can
      // read settlement straight from the oracle, surviving Gamma editorial
      // delisting. Normalised to lowercase 0x… for consistent storage.
      // Null when Gamma omits the field (rare, admin-resolved specials).
      const questionId = normalizeQuestionId(market.questionID);

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
            homeTeamCrest: crest,
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
            questionId,
            apiSource: API_SOURCE,
            lastSyncedAt: new Date(),
          },
          update: {
            homeTeam,
            awayTeam,
            homeTeamCrest: crest,
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
            // Backfill questionId on existing rows that pre-date this column.
            // Once written, Gamma re-emits the same value every poll so the
            // upsert is idempotent.
            questionId,
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
  for (const code of Object.keys(counts)) recordSync(code);
}

// ── Single-category sync (admin on-demand) ──────────────────────────────────

/**
 * Sync ONE PM category by code. Same logic as bulkSync but restricted to the
 * category's own tagIds, and only upserts markets that categorize to this
 * code. Used by the admin "Refresh this category" button so the operator
 * doesn't have to wait the 6h cron cycle.
 *
 * Returns the per-tag fetch count + per-event/market upsert count so the UI
 * can report "fetched 142 events → upserted 38 markets".
 *
 * See PLAN-ADMIN-REFACTOR.md Phase 4.
 */
export async function syncCategory(code: string): Promise<{ tagIds: string[]; eventsFetched: number; marketsUpserted: number; markets: number }> {
  const pmCats = await getPolymarketCategories();
  const cat = pmCats.find(c => c.code === code);
  if (!cat) throw new Error(`Polymarket category not found: ${code}`);
  if (cat.tagIds.length === 0) {
    console.warn(`[PolymarketSync] No tagIds configured on category ${code} - nothing to sync`);
    return { tagIds: [], eventsFetched: 0, marketsUpserted: 0, markets: 0 };
  }

  const maxPagesPerTag = Number(process.env.POLYMARKET_MAX_PAGES_PER_TAG) || 4;
  const eventsById = new Map<string, any>();
  for (const tagId of cat.tagIds) {
    let offset = 0;
    while (offset < maxPagesPerTag * 100) {
      let page: any = null;
      for (let attempt = 0; attempt < 2 && page === null; attempt++) {
        try {
          page = await polymarketFetch(`/events?closed=false&tag_id=${tagId}&limit=100&offset=${offset}`);
        } catch (error) {
          if (attempt === 0) { await sleep(2_000); continue; }
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
    return { tagIds: cat.tagIds, eventsFetched: 0, marketsUpserted: 0, markets: 0 };
  }

  const lim = { maxMarkets: cat.maxMarkets, maxSubmarketsPerEvent: cat.maxSubmarketsPerEvent };
  let count = 0;
  let totalMarkets = 0;

  for (const event of events) {
    // Restrict to events that categorize to THIS code. Without this guard a
    // tag the operator shares between categories would import twice.
    const matched = await categorizeEvent(event.tags ?? []);
    if (!matched || matched.code !== code) continue;
    if ((event.volume24hr ?? 0) < cat.minVolume24h) continue;

    const markets = event.markets ?? [];
    if (markets.length === 0) continue;

    let perEventSynced = 0;
    for (const market of markets) {
      if (perEventSynced >= lim.maxSubmarketsPerEvent) break;
      if (!market?.id || !market.outcomes || !market.endDate) continue;
      if (market.active === false) continue;
      if (!market.outcomePrices) continue;
      if (count >= lim.maxMarkets) break;
      const outcomes = safeJsonParse<string[]>(market.outcomes);
      if (!outcomes || outcomes.length < 2) continue;
      const endDate = new Date(market.endDate);
      if (isNaN(endDate.getTime())) continue;
      if (endDate.getTime() < Date.now()) continue;
      if (market.closed) continue;

      totalMarkets++;
      const isGenericYesNo = outcomes[0] === 'Yes' && outcomes[1] === 'No';
      const questionTitle = market.question || event.title || 'Prediction';
      const homeTeam = isGenericYesNo ? questionTitle : outcomes[0];
      const awayTeam = isGenericYesNo ? '' : outcomes[1];

      const description: string | null = market.description || event.description || null;
      const outcomePrices = safeJsonParse<string[]>(market.outcomePrices);
      const marketOdds = outcomePrices?.length ? parseFloat(outcomePrices[0]) : null;
      const groupItemTitle: string | null = description || market.groupItemTitle || null;
      const clobTokenIds: string | null = market.clobTokenIds || null;
      const crest: string | null = market.image || market.icon || event.image || event.icon || null;
      const tagLabels: string[] = Array.isArray(event.tags)
        ? event.tags.map((t: any) => t.label || t).filter(Boolean)
        : [];
      const tags: string | null = tagLabels.length > 0 ? JSON.stringify(tagLabels) : null;
      const subcategory = await pickSubcategory(code, tagLabels);
      const questionId = normalizeQuestionId(market.questionID);

      let status = 'SCHEDULED';
      if (market.closed && market.umaResolutionStatus === 'resolved') status = 'FINISHED';
      else if (market.closed) status = 'LIVE';

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
            league: code,
            leagueName: cat.name,
            season: null,
            matchday: null,
            homeTeam,
            awayTeam,
            homeTeamCrest: crest,
            awayTeamCrest: null,
            kickoff: endDate,
            status,
            homeScore: null,
            awayScore: null,
            winner: null,
            marketOdds,
            groupItemTitle,
            clobTokenIds,
            tags,
            subcategory,
            questionId,
            apiSource: API_SOURCE,
            lastSyncedAt: new Date(),
          },
          update: {
            homeTeam,
            awayTeam,
            homeTeamCrest: crest,
            kickoff: endDate,
            status,
            marketOdds,
            groupItemTitle,
            clobTokenIds,
            tags,
            subcategory,
            questionId,
            lastSyncedAt: new Date(),
          },
        });
        count++;
        perEventSynced++;
      } catch (error) {
        console.warn(`[PolymarketSync] Upsert failed for market ${market.id}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  recordSync(code);
  console.log(`[PolymarketSync] syncCategory(${code}): events=${events.length} markets=${totalMarkets} upserted=${count}`);
  return { tagIds: cat.tagIds, eventsFetched: events.length, marketsUpserted: count, markets: totalMarkets };
}

// ── Re-bucket existing pools ──────────────────────────────────────────────────

/**
 * Re-apply the current categorization to EXISTING PM pools: recompute each pool's
 * `league` (matchPriority) and `subcategory` (pickSubcategory) from its stored tags.
 * Lets admin config changes (new subcategories, priority tweaks) take effect on
 * pools that already exist, instead of only on newly-created ones. Idempotent.
 */
export async function recategorizePmPools(): Promise<{ moved: number; rebucketed: number; badged: number }> {
  const pools = await prisma.pool.findMany({
    where: { league: { startsWith: 'PM_' } },
    select: { id: true, league: true, tags: true, subcategory: true, matchId: true, homeTeamCrest: true },
  });
  // Badge URLs from the (freshly-synced) cache, keyed by externalId == pool.matchId.
  const cacheRows = await prisma.sportsFixtureCache.findMany({
    where: { sport: 'POLYMARKET', homeTeamCrest: { not: null } },
    select: { externalId: true, homeTeamCrest: true },
  });
  const crestByMatchId = new Map(cacheRows.map(r => [r.externalId, r.homeTeamCrest]));

  let moved = 0, rebucketed = 0, badged = 0;
  for (const p of pools) {
    const tags = safeJsonParse<string[]>(p.tags) || [];
    const cat = await categorizeEvent(tags.map(l => ({ label: l })));
    const newLeague = cat?.code ?? p.league!;
    const newSub = await pickSubcategory(newLeague, tags);
    const newCrest = (p.matchId && crestByMatchId.get(p.matchId)) || p.homeTeamCrest;
    if (newLeague !== p.league || newSub !== p.subcategory || newCrest !== p.homeTeamCrest) {
      await prisma.pool.update({ where: { id: p.id }, data: { league: newLeague, subcategory: newSub, homeTeamCrest: newCrest } });
      if (newLeague !== p.league) moved++;
      if (newSub !== p.subcategory) rebucketed++;
      if (newCrest !== p.homeTeamCrest) badged++;
    }
  }
  if (moved || rebucketed || badged) console.log(`[PolymarketSync] Re-bucketed PM pools: ${moved} moved, ${rebucketed} re-bucketed, ${badged} badged`);
  return { moved, rebucketed, badged };
}

// ── Resolution Poll ─────────────────────────────────────────────────────────

/**
 * Classify a Polymarket market's current state via Gamma /markets?id=X,
 * optionally consulting UMA's Optimistic Oracle on Polygon first when the
 * flag POLYMARKET_USE_UMA=true and we have a cached questionId.
 *
 * Why the discriminated state: the original null-for-everything sentinel
 * silently lumped "delisted" and "still pending UMA" into the same return,
 * so pool resolution could not tell the two apart and stayed in JOINING
 * for the full 24h grace window even when the market had clearly been
 * removed from Gamma.
 *
 *   resolved   — UMA closed it (oracle-direct) OR Gamma's
 *                umaResolutionStatus matches.
 *   paused     — UMA adapter paused (DVM dispute). Leave alone; admin
 *                review territory. Cache stays in current status.
 *   delisted   — Gamma returns [] AND UMA either confirms it's gone or
 *                we have no questionId to ask UMA. The sweep then
 *                cancels the pool after grace.
 *   pending    — Market still live, or UMA hasn't closed yet, or UMA
 *                says it's still live even though Gamma dropped it
 *                (editorial action — don't cancel).
 */
type MarketResolutionState =
  | { kind: 'delisted' }
  | { kind: 'pending' }
  | { kind: 'paused' }
  | { kind: 'resolved'; result: MatchResult; oracle: 'uma' | 'gamma' };

const POLYMARKET_USE_UMA = (): boolean => process.env.POLYMARKET_USE_UMA === 'true';

async function pollPolymarketMarket(
  marketId: string,
  questionId: string | null,
): Promise<MarketResolutionState> {
  // ── UMA-first path (behind flag) ──────────────────────────────────────
  // When enabled + we have a questionId, ask the oracle directly. UMA's
  // answer is authoritative — once the adapter returns `resolved=true`,
  // the outcome is final regardless of what Gamma's editorial layer is
  // doing. We still fall through to Gamma when UMA can't help (pending,
  // unknown, rpc-error) so resolutions never get stuck waiting on the
  // RPC if it's degraded.
  const umaEnabled = POLYMARKET_USE_UMA() && !!questionId;
  let umaSaidPending = false;
  if (umaEnabled) {
    const uma = await readUmaQuestion(questionId!);
    if (uma.kind === 'resolved') {
      // UMA encodes outcomes as int256 (0 = NO/AWAY, 1 = YES/HOME for
      // two-outcome markets). Same HOME/AWAY mapping the Gamma path uses
      // downstream, so the rest of the pipeline doesn't change.
      const winner: 'HOME' | 'AWAY' = uma.outcome === 1 ? 'HOME' : 'AWAY';
      return {
        kind: 'resolved',
        oracle: 'uma',
        result: {
          matchId: marketId,
          status: 'FINISHED',
          homeScore: winner === 'HOME' ? 1 : 0,
          awayScore: winner === 'AWAY' ? 1 : 0,
          winner,
        },
      };
    }
    if (uma.kind === 'paused') return { kind: 'paused' };
    if (uma.kind === 'pending') umaSaidPending = true;
    // 'unknown' / 'rpc-error' → fall through to Gamma without overriding
    // the delisted path. unknown means the question was never registered
    // (admin-resolved special), so Gamma is the only source of truth.
  }

  const data = await polymarketFetch(`/markets?id=${marketId}`);
  // Gamma returns [] when the market has been delisted entirely. Default
  // behaviour is to treat that as terminal — but if UMA explicitly told us
  // the question is still pending, the delisting is editorial and we hold
  // the resolution open. This is the exact fix for the gamma-delisted-
  // immediate cancellations that today eat hourly PM_FINANCE duplicates
  // and PM_CULTURE markets whose listing got pulled mid-window.
  if (Array.isArray(data) && data.length === 0) {
    return umaSaidPending ? { kind: 'pending' } : { kind: 'delisted' };
  }
  const market = Array.isArray(data) ? data[0] : data;
  if (!market) return umaSaidPending ? { kind: 'pending' } : { kind: 'delisted' };

  if (!market.closed || market.umaResolutionStatus !== 'resolved') {
    return { kind: 'pending' };
  }

  const prices = safeJsonParse<string[]>(market.outcomePrices);
  if (!prices || prices.length < 2) return { kind: 'pending' };
  const price0 = parseFloat(prices[0]);
  const price1 = parseFloat(prices[1]);
  const winner: 'HOME' | 'AWAY' = price0 > price1 ? 'HOME' : 'AWAY';
  return {
    kind: 'resolved',
    oracle: 'gamma',
    result: {
      matchId: String(market.id),
      status: 'FINISHED',
      homeScore: winner === 'HOME' ? 1 : 0,
      awayScore: winner === 'AWAY' ? 1 : 0,
      winner,
    },
  };
}

// Throttle the "still pending" log so a 10-min cron doesn't spam stderr
// when 30+ markets are all waiting on UMA. One line per hour is enough
// visibility for the operator.
let lastPendingLogAt = 0;
const PENDING_LOG_INTERVAL_MS = 60 * 60_000;

/**
 * Check cached Polymarket markets that are past their endDate but not
 * resolved. Polls Gamma per market and now distinguishes three states:
 *
 *   resolved   — UMA closed it. Mark cache FINISHED with the winner.
 *   delisted   — Gamma returns []. Mark cache CANCELLED with a reason —
 *                sweepStuckPmPools then skips the 24h grace and
 *                cancels the pool immediately.
 *   pending    — Market still live or UMA hasn't closed. No-op; we'll
 *                retry next cycle.
 */
async function resolutionPoll(): Promise<void> {
  const pending = await prisma.sportsFixtureCache.findMany({
    where: {
      sport: 'POLYMARKET',
      apiSource: API_SOURCE,
      status: { notIn: ['FINISHED', 'CANCELLED'] },
      kickoff: { lte: new Date() }, // past endDate
    },
    select: { externalId: true, questionId: true },
  });

  if (pending.length === 0) return;

  let resolved = 0;
  let resolvedByUma = 0;
  let delisted = 0;
  let paused = 0;
  let stillPending = 0;

  for (const { externalId, questionId } of pending) {
    try {
      const state = await pollPolymarketMarket(externalId, questionId);

      if (state.kind === 'resolved') {
        const winner = state.result.winner === 'HOME' ? 'HOME' : 'AWAY';
        await prisma.sportsFixtureCache.updateMany({
          where: { externalId, sport: 'POLYMARKET', apiSource: API_SOURCE },
          data: {
            status: 'FINISHED',
            homeScore: state.result.homeScore,
            awayScore: state.result.awayScore,
            winner,
            lastSyncedAt: new Date(),
          },
        });
        // Track the oracle source so the cutover decision has hard data.
        // Event log is best-effort — losing a counter row is fine, the
        // cache update is the source of truth.
        await prisma.eventLog.create({
          data: {
            eventType: 'POOL_PM_MARKET_RESOLVED',
            entityType: 'market',
            entityId: externalId,
            payload: { marketId: externalId, oracle: state.oracle, winner },
          },
        }).catch(() => {});
        resolved++;
        if (state.oracle === 'uma') resolvedByUma++;
      } else if (state.kind === 'delisted') {
        await prisma.sportsFixtureCache.updateMany({
          where: { externalId, sport: 'POLYMARKET', apiSource: API_SOURCE },
          data: { status: 'CANCELLED', lastSyncedAt: new Date() },
        });
        await prisma.eventLog.create({
          data: {
            eventType: 'POOL_PM_DELISTED_DETECTED',
            entityType: 'market',
            entityId: externalId,
            payload: { marketId: externalId, source: 'gamma-empty-response' },
          },
        }).catch(() => {});
        console.warn(`[PolymarketSync] Market ${externalId} delisted from Gamma — cache → CANCELLED. Pool sweep will cancel any matching pool on its next pass.`);
        delisted++;
      } else if (state.kind === 'paused') {
        // UMA adapter paused — usually a disputed market waiting on DVM
        // vote. We leave the cache row alone (don't cancel, don't
        // FINISH) and log so the admin tab can surface it. Polls retry
        // each cycle in case the dispute settles.
        await prisma.eventLog.create({
          data: {
            eventType: 'POOL_PM_UMA_PAUSED',
            entityType: 'market',
            entityId: externalId,
            payload: { marketId: externalId, questionId },
          },
        }).catch(() => {});
        paused++;
      } else {
        stillPending++;
      }
    } catch (error) {
      console.warn(`[PolymarketSync] Resolution poll failed for ${externalId}:`, error instanceof Error ? error.message : error);
    }

    // Rate limit between API calls
    await sleep(RATE_LIMIT_MS);
  }

  if (resolved > 0 || delisted > 0 || paused > 0) {
    console.log(`[PolymarketSync] Resolution poll: resolved=${resolved} (uma=${resolvedByUma}) delisted=${delisted} paused=${paused} still-pending=${stillPending} (of ${pending.length})`);
  } else if (stillPending > 0 && Date.now() - lastPendingLogAt > PENDING_LOG_INTERVAL_MS) {
    // Throttle: heartbeat once per hour so the operator knows the pipe is
    // running even when nothing is changing state.
    console.log(`[PolymarketSync] Resolution poll: ${stillPending} markets still pending UMA / live.`);
    lastPendingLogAt = Date.now();
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Remove expired/resolved markets from cache.
 *
 * Two passes, both Polymarket-only:
 *   1. Expired-not-finished — past kickoff and not FINISHED, but ONLY if
 *      no open Pool still references the row's externalId. Without this
 *      guard the daily 05:00 UTC cleanup was nuking cache rows whose
 *      pool was still JOINING / ACTIVE (operator surfaced pool
 *      3af0b762 / matchId 825441 in exactly this state). resolutionPoll
 *      iterates the cache table, so a missing row meant the resolver
 *      could not even attempt to poll Gamma — the pool sat in JOINING
 *      indefinitely, only the sweep's 24h startTime grace could rescue
 *      it.
 *   2. Old resolved — FINISHED rows older than 30d. Unchanged.
 */
async function cleanup(): Promise<void> {
  // Get the matchIds of every PM pool still open. cache rows referenced
  // by these IDs are protected from the expired-not-finished sweep.
  const openPools = await prisma.pool.findMany({
    where: {
      poolType: 'SPORTS',
      league: { startsWith: 'PM_' },
      status: { in: ['JOINING', 'ACTIVE'] },
      matchId: { not: null },
    },
    select: { matchId: true },
  });
  const protectedMatchIds = new Set(openPools.map(p => p.matchId!).filter(Boolean));
  let protectedCount = 0;

  // Expired markets that no longer have an open pool can be removed.
  const expiredCandidates = await prisma.sportsFixtureCache.findMany({
    where: {
      sport: 'POLYMARKET',
      apiSource: API_SOURCE,
      status: { not: 'FINISHED' },
      kickoff: { lt: new Date() },
    },
    select: { externalId: true },
  });
  const toDelete: string[] = [];
  for (const row of expiredCandidates) {
    if (protectedMatchIds.has(row.externalId)) {
      protectedCount++;
    } else {
      toDelete.push(row.externalId);
    }
  }
  let expired = 0;
  if (toDelete.length > 0) {
    const r = await prisma.sportsFixtureCache.deleteMany({
      where: {
        sport: 'POLYMARKET',
        apiSource: API_SOURCE,
        externalId: { in: toDelete },
      },
    });
    expired = r.count;
  }
  if (expired > 0 || protectedCount > 0) {
    console.log(`[PolymarketSync] Cleanup: removed=${expired} protected=${protectedCount} (cache rows kept because pool still JOINING/ACTIVE)`);
  }

  // Remove old resolved markets (>30 days). FINISHED rows can be dropped
  // freely — no resolver path needs them once the pool is RESOLVED /
  // CLAIMABLE / CANCELLED.
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
      console.log('[PolymarketSync] Initial sync complete, cache ready - triggering pool creation');
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
