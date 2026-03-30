import { prisma } from '../../../db';
import type { LiveScore } from './types';
import { STALE_THRESHOLD_MS, API_LOOKUP_LIMIT, POLL_INTERVAL_MS, DB_CLEANUP_AGE_MS } from './types';
import { cacheSet, cacheGet, cacheCleanup, cachePreload, updatePreviousPollIds } from './cache';
import { fetchLivescoreAll, fetchLivescoreBySport, fetchEventLookup } from './sportsdb-source';
import { persistToDb, syncFinishedToUi, loadFromDb, cleanupOldDbEntries } from './db-persistence';
import { isMidnightBoundary, detectStaleEvents } from './staleness';
import { fetchScoreFromChatGPT } from './chatgpt-source';
import { CHATGPT_MAX_PER_CYCLE } from './types';
import {
  recordPollSuccess, recordPollFailure, recordLookupCall,
  recordEventDisappeared, recordMidnightBoundary, recordChatGPTTriggered,
  recordChatGPTSuccess, recordChatGPTRejected, clearMissingEvent,
} from './metrics';

// ─── State ───────────────────────────────────────────────────────────────────

let polling = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

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

        cacheSet(entry);
        toPersist.push(entry);
        clearMissingEvent(eventId);
        fetched++;
      } catch { /* skip individual failures */ }
    }

    if (fetched > 0) {
      console.log(`[LiveScore] Fetched ${fetched} missing pool score(s) via individual lookup`);
    }
  } catch { /* best-effort */ }
}

// ─── ChatGPT fallback ────────────────────────────────────────────────────────

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

    // Only trigger ChatGPT for events that individual lookup also couldn't resolve
    const alreadyResolved = toPersist.some(e => e.eventId === stale.eventId);
    if (alreadyResolved) continue;

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

    // 5. Staleness detection + ChatGPT fallback
    const { matchIds, kickoffs } = await getActivePoolInfo();
    const staleEvents = detectStaleEvents(matchIds, freshIds, disappeared, kickoffs);
    if (staleEvents.length > 0) {
      console.log(`[LiveScore] Stale events: ${staleEvents.map(e => `${e.eventId}(${e.reason})`).join(', ')}`);
      await pollChatGPTFallbacks(staleEvents, kickoffs, toPersist);
    }

    // 6. Persist to DB + sync finished to UI (non-blocking)
    persistToDb(toPersist).catch(() => {});
    syncFinishedToUi(toPersist).catch(() => {});

    // 7. Cleanup stale entries
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
