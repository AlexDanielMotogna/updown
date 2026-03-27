import cron from 'node-cron';
import { prisma } from '../db';
import { getAdapter } from '../services/sports';
import { polymarketFetch } from '../services/sports/polymarket-fetch';
import { categorizeEvent } from '../services/sports/polymarket-adapter';
import type { MatchResult } from '../services/sports/types';
import { createMatchPools } from './sports-scheduler';

const API_SOURCE = 'polymarket-gamma';
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
async function bulkSync(): Promise<void> {
  let events: any[];
  try {
    events = await polymarketFetch(
      '/events?active=true&closed=false&order=volume&ascending=false&limit=200',
    );
  } catch (error) {
    console.error('[PolymarketSync] Bulk sync fetch failed:', error instanceof Error ? error.message : error);
    return;
  }

  if (!Array.isArray(events)) {
    console.warn('[PolymarketSync] Unexpected response format from /events');
    return;
  }

  const counts: Record<string, number> = {};
  const maxPerCat = Number(process.env.POLYMARKET_MAX_MARKETS_PER_CATEGORY) || 10;
  let totalSynced = 0;

  for (const event of events) {
    const cat = await categorizeEvent(event.tags ?? []);
    if (!cat) continue;

    // Volume filter
    if ((event.volume24hr ?? 0) < cat.minVolume24h) continue;

    // Process sub-markets: for multi-market events, sync each sub-market as its own entry
    const markets = event.markets ?? [];
    if (markets.length === 0) continue;

    // For single-market events, take the one market.
    // For multi-market events (like price targets), take up to 5 most relevant.
    const marketsToSync = markets.length === 1
      ? markets
      : markets.slice(0, 5);

    for (const market of marketsToSync) {
      if (!market?.id || !market.outcomes || !market.endDate) continue;

      // Check per-category cap
      counts[cat.code] = (counts[cat.code] ?? 0);
      if (counts[cat.code] >= maxPerCat) break;

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
            lastSyncedAt: new Date(),
          },
        });

        counts[cat.code]++;
        totalSynced++;
      } catch (error) {
        console.warn(`[PolymarketSync] Upsert failed for market ${market.id}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  console.log(`[PolymarketSync] Bulk sync complete: ${totalSynced} markets (${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(', ')})`);
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
