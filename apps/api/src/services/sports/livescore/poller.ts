import { prisma } from '../../../db';
import type { LiveScore } from './types';
import { STALE_THRESHOLD_MS, API_LOOKUP_LIMIT, POLL_INTERVAL_MS, DB_CLEANUP_AGE_MS } from './types';
import { cacheSet, cacheGet, cacheCleanup, cachePreload, updatePreviousPollIds } from './cache';
import { fetchLivescoreAll, fetchLivescoreBySport, fetchEventLookup } from './sportsdb-source';
import { persistToDb, syncFinishedToUi, loadFromDb, cleanupOldDbEntries } from './db-persistence';
import { isMidnightBoundary, detectStaleEvents } from './staleness';
import { fetchScoreFromChatGPT } from './chatgpt-source';
import { fetchOddsApiScores, matchGamesToPools, getOddsApiSportKeys, isOddsApiDisabled } from './odds-api-source';
import { CHATGPT_MAX_PER_CYCLE, LEAGUE_TO_ODDS_API } from './types';

import {
  recordPollSuccess, recordPollFailure, recordLookupCall,
  recordEventDisappeared, recordMidnightBoundary, recordChatGPTTriggered,
  recordChatGPTSuccess, recordChatGPTRejected, clearMissingEvent,
  recordOddsApiSuccess,
} from './metrics';

// ─── State ───────────────────────────────────────────────────────────────────

let polling = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let lastDaysFromCall = 0;
const DAYS_FROM_INTERVAL_MS = 2 * 60_000; // daysFrom=1 every 2 min max (costs 2 credits)

// ─── Active pool helpers ─────────────────────────────────────────────────────

/** Get match IDs + kickoff times for all active pools that have started */
async function getActivePoolInfo(): Promise<{ matchIds: string[]; kickoffs: Map<string, Date> }> {
  try {
    const pools = await prisma.pool.findMany({
      where: {
        poolType: 'SPORTS',
        status: { in: ['JOINING', 'ACTIVE'] },
        matchId: { not: null },
        startTime: { lte: new Date() },
      },
      select: { matchId: true, startTime: true },
    });

    const matchIds = pools.map(p => p.matchId!);
    const kickoffs = new Map<string, Date>();
    for (const p of pools) {
      kickoffs.set(p.matchId!, p.startTime);
    }
    return { matchIds, kickoffs };
  } catch {
    return { matchIds: [], kickoffs: new Map() };
  }
}

/** Get unique sports of active pools (for sport-specific feeds) */
async function getActiveSports(): Promise<string[]> {
  try {
    const rows = await prisma.pool.findMany({
      where: {
        poolType: 'SPORTS',
        status: { in: ['JOINING', 'ACTIVE'] },
        startTime: { lte: new Date() },
        league: { not: null },
      },
      select: { league: true },
      distinct: ['league'],
    });

    // Map league codes to TheSportsDB sport names
    const sportMap: Record<string, string> = {
      NBA: 'Basketball',
      NHL: 'Ice Hockey',
      NFL: 'American Football',
      MMA: 'Fighting',
    };

    const sports = new Set<string>();
    for (const r of rows) {
      const sport = sportMap[r.league!];
      if (sport) sports.add(sport);
    }
    // Football leagues (CL, PL, etc.) → Soccer
    const footballLeagues = ['CL', 'PL', 'PD', 'SA', 'BL1', 'FL1', 'BSA', 'EL'];
    if (rows.some(r => footballLeagues.includes(r.league!))) {
      sports.add('Soccer');
    }
    return [...sports];
  } catch {
    return [];
  }
}

// ─── Missing pool fallback ───────────────────────────────────────────────────

/**
 * /livescore/all is unreliable — some live games don't appear.
 * For pools whose startTime passed but weren't in the livescore feed,
 * do individual /lookup/event calls to get their scores.
 */
async function pollMissingPools(foundIds: Set<string>, toPersist: LiveScore[]): Promise<void> {
  try {
    const { matchIds } = await getActivePoolInfo();
    const now = Date.now();
    const missing = matchIds.filter(id => {
      if (foundIds.has(id)) return false; // Already in this poll's fresh data
      const cached = cacheGet(id);
      if (!cached) return true; // Not in cache at all
      return now - cached.updatedAt > STALE_THRESHOLD_MS; // In cache but stale
    });

    if (missing.length === 0) return;

    let fetched = 0;
    for (const eventId of missing.slice(0, API_LOOKUP_LIMIT)) {
      try {
        recordLookupCall();
        const entry = await fetchEventLookup(eventId);
        if (!entry) continue;

        // Cache NS/TBD so staleness detection knows the event exists but hasn't started
        cacheSet(entry);

        // Only persist & mark resolved for events that have actually started
        if (entry.status !== 'NS' && entry.status !== 'TBD') {
          toPersist.push(entry);
          clearMissingEvent(eventId);
          fetched++;
        }
      } catch { /* skip individual failures */ }
    }

    if (fetched > 0) {
      console.log(`[LiveScore] Fetched ${fetched} missing pool score(s) via individual lookup`);
    }
  } catch { /* best-effort */ }
}

// ─── The Odds API — Parallel source ──────────────────────────────────────────

/**
 * Poll The Odds API in parallel with TheSportsDB every cycle.
 * Fetches ALL games for each sport that has active pools.
 * Merges into toPersist — newer data wins.
 */
async function pollOddsApiParallel(
  freshSportsDbIds: Set<string>,
  toPersist: LiveScore[],
): Promise<void> {
  if (isOddsApiDisabled()) return;

  try {
    // Get all active sports pools with startTime passed
    const activePools = await prisma.pool.findMany({
      where: {
        poolType: 'SPORTS',
        status: { in: ['JOINING', 'ACTIVE'] },
        matchId: { not: null },
        startTime: { lte: new Date() },
      },
      select: { matchId: true, homeTeam: true, awayTeam: true, league: true, startTime: true },
    });

    if (activePools.length === 0) return;

    // Get unique sport keys needed
    const leagues = [...new Set(activePools.map(p => p.league).filter(Boolean))] as string[];
    const sportKeys = getOddsApiSportKeys(leagues);
    if (sportKeys.length === 0) return;

    // daysFrom=1 costs 2 credits instead of 1 — only use every 5 min for old pools
    const fourHoursAgo = Date.now() - 4 * 3600_000;
    const hasOldPools = activePools.some(p => p.startTime.getTime() < fourHoursAgo);
    const useDaysFrom = hasOldPools && Date.now() - lastDaysFromCall > DAYS_FROM_INTERVAL_MS;
    if (useDaysFrom) lastDaysFromCall = Date.now();

    // Fetch all sports in parallel
    const allGames = await Promise.all(
      sportKeys.map(async (key) => {
        const games = await fetchOddsApiScores(key, useDaysFrom ? 1 : undefined);
        return { key, games };
      }),
    );

    // Build pool list for matching
    const poolsForMatching = activePools
      .filter(p => p.matchId && p.homeTeam && p.awayTeam && p.league)
      .map(p => ({ matchId: p.matchId!, homeTeam: p.homeTeam!, awayTeam: p.awayTeam!, league: p.league! }));

    // Match and merge
    let matched = 0;
    for (const { key, games } of allGames) {
      if (games.length === 0) continue;

      // Only match pools whose league maps to this sport key
      const relevantPools = poolsForMatching.filter(p => LEAGUE_TO_ODDS_API[p.league] === key);
      const results = matchGamesToPools(games, relevantPools);

      for (const entry of results) {
        const existing = toPersist.find(e => e.eventId === entry.eventId);

        // If TheSportsDB already has this event with a more specific status, skip
        // But if TheSportsDB has NS/stale and Odds API has LIVE/FT, Odds API wins
        if (existing) {
          const sdbIsStale = existing.status === 'NS' || existing.status === 'TBD' || existing.status === '';
          if (!sdbIsStale && existing.updatedAt >= entry.updatedAt) continue;
          // Replace stale TheSportsDB entry
          const idx = toPersist.indexOf(existing);
          toPersist[idx] = entry;
        } else {
          toPersist.push(entry);
        }

        cacheSet(entry);
        clearMissingEvent(entry.eventId);
        matched++;

        if (entry.status === 'FT') {
          recordOddsApiSuccess(entry.eventId, `${entry.homeScore}-${entry.awayScore} (FT)`);
        }
      }
    }

    if (matched > 0) {
      const totalGames = allGames.reduce((s, r) => s + r.games.length, 0);
      console.log(`[OddsAPI] ${sportKeys.length} sports, ${totalGames} games, ${matched} matched to pools`);
    }
  } catch (error) {
    console.warn('[OddsAPI] Parallel poll error:', (error as Error).message);
  }
}

// ─── ChatGPT fallback (Tier 2) ──────────────────────────────────────────────

/**
 * For stale events that couldn't be resolved via TheSportsDB,
 * query ChatGPT as a last-resort fallback (max 3 per cycle).
 */
async function pollChatGPTFallbacks(
  staleEvents: Array<{ eventId: string; reason: string }>,
  kickoffs: Map<string, Date>,
  toPersist: LiveScore[],
): Promise<void> {
  let called = 0;

  for (const stale of staleEvents) {
    if (called >= CHATGPT_MAX_PER_CYCLE) break;

    // Skip if individual lookup already resolved this event
    const alreadyResolved = toPersist.some(e => e.eventId === stale.eventId);
    if (alreadyResolved) continue;

    // Skip if lookup found the event but it hasn't started (NS/TBD) — unless stuck
    const cached = cacheGet(stale.eventId);
    if (cached && (cached.status === 'NS' || cached.status === 'TBD') && stale.reason !== 'STUCK_NS') continue;

    // Get pool info for the prompt
    try {
      const pool = await prisma.pool.findFirst({
        where: { matchId: stale.eventId, poolType: 'SPORTS' },
        select: { homeTeam: true, awayTeam: true, league: true },
      });
      if (!pool?.homeTeam || !pool?.awayTeam) continue;

      const kickoff = kickoffs.get(stale.eventId) || new Date();
      const cached = cacheGet(stale.eventId);
      const lastKnown = cached
        ? { homeScore: cached.homeScore, awayScore: cached.awayScore, status: cached.status }
        : null;

      // Map league to sport name for the prompt
      const sportMap: Record<string, string> = {
        NBA: 'Basketball', NHL: 'Ice Hockey', NFL: 'American Football', MMA: 'MMA/UFC',
        CL: 'Football', PL: 'Football', PD: 'Football', SA: 'Football',
        BL1: 'Football', FL1: 'Football', BSA: 'Football', EL: 'Football',
      };
      const sport = sportMap[pool.league || ''] || 'Sports';

      recordChatGPTTriggered(stale.eventId, `${pool.homeTeam} vs ${pool.awayTeam} (${stale.reason})`);

      const entry = await fetchScoreFromChatGPT(
        stale.eventId,
        pool.homeTeam,
        pool.awayTeam,
        sport,
        pool.league || '',
        kickoff,
        lastKnown,
      );

      if (entry) {
        cacheSet(entry);
        toPersist.push(entry);
        recordChatGPTSuccess(stale.eventId, `${entry.homeScore}-${entry.awayScore} (${entry.status})`);
        called++;
      } else {
        recordChatGPTRejected(stale.eventId, 'No usable response');
      }
    } catch { /* skip */ }
  }
}

// ─── Main poll cycle ─────────────────────────────────────────────────────────

async function pollLiveScores(): Promise<void> {
  const pollStart = Date.now();
  try {
    // 1. Fetch all live scores from TheSportsDB
    let freshEntries = await fetchLivescoreAll();

    // 1b. Midnight UTC boundary fix: also poll sport-specific feeds
    if (isMidnightBoundary()) {
      recordMidnightBoundary();
      const sports = await getActiveSports();
      if (sports.length > 0) {
        console.log(`[LiveScore] Midnight boundary — polling ${sports.length} sport-specific feed(s)`);
        const seenIds = new Set(freshEntries.map(e => e.eventId));

        for (const sport of sports) {
          try {
            const sportEntries = await fetchLivescoreBySport(sport);
            // Merge: only add events not already in /livescore/all
            for (const entry of sportEntries) {
              if (!seenIds.has(entry.eventId)) {
                freshEntries.push(entry);
                seenIds.add(entry.eventId);
              }
            }
          } catch { /* skip — best effort */ }
        }
      }
    }

    const sportCounts: Record<string, number> = {};
    const toPersist: LiveScore[] = [];
    const freshIds = new Set<string>();

    // 2. Update cache with fresh data
    for (const entry of freshEntries) {
      freshIds.add(entry.eventId);
      cacheSet(entry);
      toPersist.push(entry);

      const sport = entry.sport || 'Unknown';
      sportCounts[sport] = (sportCounts[sport] || 0) + 1;
    }

    // 3. Detect disappeared events (were in previous poll, not in current)
    const disappeared = updatePreviousPollIds(freshIds);
    if (disappeared.length > 0) {
      console.log(`[LiveScore] ${disappeared.length} event(s) disappeared from feed — queuing for individual lookup`);
      for (const eid of disappeared) {
        const entry = cacheGet(eid);
        if (entry) recordEventDisappeared(eid, entry.homeTeam, entry.awayTeam, entry.sport);
      }
    }

    // Clear missing events that reappeared
    for (const id of freshIds) clearMissingEvent(id);

    // 4. Individual lookups for active pools not in feed
    // MUST await before persisting — pollMissingPools mutates toPersist
    await pollMissingPools(freshIds, toPersist);

    // 5. The Odds API — PARALLEL source (runs every cycle, not just on stale)
    await pollOddsApiParallel(freshIds, toPersist);

    // 6. ChatGPT — last resort for anything still unresolved
    const { matchIds, kickoffs } = await getActivePoolInfo();
    const staleEvents = detectStaleEvents(matchIds, freshIds, disappeared, kickoffs);
    if (staleEvents.length > 0) {
      // Only ChatGPT for events not resolved by TheSportsDB or Odds API
      const stillUnresolved = staleEvents.filter(e => !toPersist.some(p => p.eventId === e.eventId));
      if (stillUnresolved.length > 0) {
        console.log(`[LiveScore] Still unresolved after Odds API: ${stillUnresolved.map(e => `${e.eventId}(${e.reason})`).join(', ')}`);
        await pollChatGPTFallbacks(stillUnresolved, kickoffs, toPersist);
      }
    }

    // 7. Persist to DB + sync finished to UI (non-blocking)
    persistToDb(toPersist).catch(() => {});
    syncFinishedToUi(toPersist).catch(() => {});

    // 8. Cleanup stale entries
    cacheCleanup();

    // Record poll success metrics
    recordPollSuccess(freshEntries.length, Date.now() - pollStart);

    const summary = Object.entries(sportCounts).map(([s, n]) => `${s}:${n}`).join(', ');
    if (summary) {
      console.log(`[LiveScore] ${summary} (${toPersist.length} persisted to DB)`);
    }
  } catch (error) {
    recordPollFailure((error as Error).message || 'Unknown poll error');
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export function startLiveScorePolling(): void {
  if (polling) return;
  polling = true;

  // Preload cache from DB so data is available immediately after restart
  loadFromDb().then(entries => {
    if (entries.length > 0) {
      cachePreload(entries);
      console.log(`[LiveScore] Preloaded ${entries.length} entries from DB`);
    }
  }).catch(() => {});

  // Initial poll
  pollLiveScores().catch(() => {});

  // Poll every 30s
  pollInterval = setInterval(() => {
    pollLiveScores().catch(() => {});
  }, POLL_INTERVAL_MS);

  // Cleanup old DB entries once a day
  setInterval(() => {
    cleanupOldDbEntries().catch(() => {});
  }, DB_CLEANUP_AGE_MS);

  console.log('[LiveScore] Polling started (every 30s, persisting to DB)');
}

export function stopLiveScorePolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  polling = false;
}
