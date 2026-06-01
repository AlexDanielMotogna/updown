import { prisma } from '../../../db';
import type { LiveScore } from './types';
import { STALE_THRESHOLD_MS, API_LOOKUP_LIMIT, POLL_INTERVAL_MS, DB_CLEANUP_AGE_MS, isFinishedStatus } from './types';
import { cacheSet, cacheGet, cacheCleanup, cachePreload, updatePreviousPollIds } from './cache';
import { fetchLivescoreAll, fetchLivescoreBySport, fetchEventLookup } from './sportsdb-source';
import { persistToDb, syncFinishedToUi, loadFromDb, cleanupOldDbEntries } from './db-persistence';
import { isMidnightBoundary, detectStaleEvents } from './staleness';
import { fetchScoreFromChatGPT } from './chatgpt-source';
import { fetchOddsApiScores, matchGamesToPools, getOddsApiSportKeys, isOddsApiDisabled } from './odds-api-source';
import { CHATGPT_MAX_PER_CYCLE, LEAGUE_TO_ODDS_API } from './types';
import { resolveMatchPools } from '../../../scheduler/sports-scheduler';

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
 * /livescore/all is unreliable - some live games don't appear.
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

// ─── The Odds API - FALLBACK source ──────────────────────────────────────────

/**
 * Fallback: poll The Odds API for any event TheSportsDB didn't already cover
 * this cycle. SDB is now the primary source — it owns display (only feed with
 * `strProgress` minute data) AND the primary FT signal. Odds API fills two
 * gaps:
 *  1. Events in leagues SDB doesn't return on `/livescore/all`.
 *  2. (Phase B, not yet implemented) Events past expected FT where SDB hasn't
 *     reported finished status after a grace window — for non-knockout leagues.
 *
 * Phase A (this commit) just stops Odds API from overwriting SDB rows. The
 * grace-window logic for late FT detection is Phase B.
 *
 * Previously called `pollOddsApiPrimary` — see `docs/PLAN-LIVESCORE-SOURCE-SPLIT.md`
 * for the architecture flip rationale.
 */
async function pollOddsApiFallback(
  toPersist: LiveScore[],
  oddsApiIds: Set<string>,
  sdbIds: Set<string>,
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

    // daysFrom=1 costs 2 credits instead of 1 - only use every 5 min for old pools
    const twoHoursAgo = Date.now() - 2 * 3600_000;
    const hasOldPools = activePools.some(p => p.startTime.getTime() < twoHoursAgo);
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
        // SDB-wins-collisions: if TheSportsDB already reported this event
        // this cycle, keep SDB's row (it has `strProgress` + AET/PEN codes
        // we can't derive from Odds API's `completed: bool`). Odds API only
        // contributes when SDB had no row for this event.
        if (sdbIds.has(entry.eventId)) continue;

        toPersist.push(entry);
        cacheSet(entry);
        oddsApiIds.add(entry.eventId);
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

    // Skip if lookup found the event but it hasn't started (NS/TBD) - unless stuck
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
    const sportCounts: Record<string, number> = {};
    const toPersist: LiveScore[] = [];

    // 1. PRIMARY — TheSportsDB /livescore/all. SDB is the only feed with
    //    `strProgress` (game-clock minute) and AET/PEN status codes; it
    //    drives the live UI and the resolution winner picking.
    let freshEntries = await fetchLivescoreAll();

    // 1b. Midnight UTC boundary fix: also poll sport-specific feeds.
    if (isMidnightBoundary()) {
      recordMidnightBoundary();
      const sports = await getActiveSports();
      if (sports.length > 0) {
        console.log(`[LiveScore] Midnight boundary - polling ${sports.length} sport-specific feed(s)`);
        const seenIds = new Set(freshEntries.map(e => e.eventId));

        for (const sport of sports) {
          try {
            const sportEntries = await fetchLivescoreBySport(sport);
            for (const entry of sportEntries) {
              if (!seenIds.has(entry.eventId)) {
                freshEntries.push(entry);
                seenIds.add(entry.eventId);
              }
            }
          } catch { /* skip - best effort */ }
        }
      }
    }

    // 2. Persist SDB rows first so Odds API knows which events to skip.
    const sdbIds = new Set<string>();
    for (const entry of freshEntries) {
      sdbIds.add(entry.eventId);
      cacheSet(entry);
      toPersist.push(entry);
      const sport = entry.sport || 'Unknown';
      sportCounts[sport] = (sportCounts[sport] || 0) + 1;
    }

    // 3. FALLBACK — The Odds API. Only contributes for events SDB didn't
    //    return (leagues outside `/livescore/all`'s coverage, etc.).
    const oddsApiIds = new Set<string>();
    await pollOddsApiFallback(toPersist, oddsApiIds, sdbIds);

    // 4. Detect disappeared events (in previous SDB poll, not in current).
    const disappeared = updatePreviousPollIds(sdbIds);
    if (disappeared.length > 0) {
      console.log(`[LiveScore] ${disappeared.length} event(s) disappeared from feed - queuing for individual lookup`);
      for (const eid of disappeared) {
        const entry = cacheGet(eid);
        if (entry) recordEventDisappeared(eid, entry.homeTeam, entry.awayTeam, entry.sport);
      }
    }

    for (const id of sdbIds) clearMissingEvent(id);

    // 5. Individual TheSportsDB lookups for active pools still missing.
    await pollMissingPools(new Set([...sdbIds, ...oddsApiIds]), toPersist);

    // 6. ChatGPT — last resort for events neither SDB, Odds API, nor the
    //    individual lookups resolved. Seen-this-cycle = union of both feeds.
    const { matchIds, kickoffs } = await getActivePoolInfo();
    const seenThisCycle = new Set([...sdbIds, ...oddsApiIds]);
    const staleEvents = detectStaleEvents(matchIds, seenThisCycle, disappeared, kickoffs);
    if (staleEvents.length > 0) {
      const stillUnresolved = staleEvents.filter(e => !toPersist.some(p => p.eventId === e.eventId));
      if (stillUnresolved.length > 0) {
        console.log(`[LiveScore] Still unresolved after SDB + Odds API: ${stillUnresolved.map(e => `${e.eventId}(${e.reason})`).join(', ')}`);
        await pollChatGPTFallbacks(stillUnresolved, kickoffs, toPersist);
      }
    }

    // 7. Persist to DB + sync finished to UI (non-blocking).
    persistToDb(toPersist).catch(() => {});
    syncFinishedToUi(toPersist).catch(() => {});

    // 7b. INSTANT RESOLVE TRIGGER — when this poll surfaced any FT events,
    // fire the sports resolver right now instead of waiting up to 2 min for
    // its own cron tick. resolveMatchPools is idempotent (skips pools that
    // are already RESOLVED) and bails immediately when there's nothing to
    // do, so the cost is bounded — but the win on the happy path is huge:
    // ~30s end-to-end (livescore poll cadence) from real FT to on-chain
    // RESOLVED, instead of "next cron + retry".
    if (toPersist.some(e => isFinishedStatus(e.status))) {
      resolveMatchPools().catch((err) => {
        console.warn('[LiveScore] Instant resolve trigger failed:', (err as Error).message);
      });
    }

    // 8. Cleanup stale entries.
    cacheCleanup();

    recordPollSuccess(toPersist.length, Date.now() - pollStart);

    const summary = Object.entries(sportCounts).map(([s, n]) => `${s}:${n}`).join(', ');
    if (summary || oddsApiIds.size > 0) {
      console.log(`[LiveScore] SDB:${sdbIds.size} OddsAPI-fallback:${oddsApiIds.size} (${toPersist.length} persisted)`);
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
