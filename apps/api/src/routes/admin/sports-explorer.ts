import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { Transaction } from '@solana/web3.js';
import { prisma } from '../../db';
import { getAdapter } from '../../services/sports';
import { createSportsPool } from '../../scheduler/sports-scheduler';
import { sportsDbFetch } from '../../services/sports/api-sports-fetch';
import { getPoolPDA, buildResolveWithWinnerIx } from 'solana-client';
import { derivePoolSeed, getConnection, getAuthorityKeypair } from '../../utils/solana';
import { emitPoolStatus } from '../../websocket';
import { KNOCKOUT_DISABLE_ODDS_FALLBACK, EXPECTED_MATCH_DURATION_MS, DEFAULT_EXPECTED_DURATION_MS, ODDS_API_FT_FALLBACK_GRACE_MS } from '../../services/sports/livescore/types';
import { classifyBadgeBackground } from '../../services/sports/badge-analyzer';
import { backfillCombatSportImages } from '../../scheduler/fixture-sync';
import type { Match } from '../../services/sports/types';
import { isSportLiveCovered, revalidateSdbEventBeforeCreation, getCoverageSnapshot } from '../../services/sports/pool-validation';

// In-memory cache for the full SDB leagues catalog (1,475 rows). The list
// changes monthly at most; 10 min TTL means at most 6 SDB calls per hour
// across however many admins open the browser. Lazy init so cold-starts
// don't pay the cost.
let sdbLeaguesCache: { ts: number; data: Array<{ id: string; name: string; sport: string; alternate: string }> } | null = null;
const SDB_LEAGUES_TTL_MS = 10 * 60_000;

// Per-id detail cache for `lookupleague.php`. Badge URLs change ~never,
// so 6h is comfortable; admins pay ~1 SDB call per league they Add or
// backfill, not 1 per browse refresh.
interface SdbLeagueDetail {
  id: string;
  name: string;
  sport: string;
  badge: string | null;
  logo: string | null;
  country: string | null;
  // Auto-classified by classifyBadgeBackground at fetch time. NULL when
  // the image isn't a PNG, the fetch failed, or the content luminance
  // landed in the ambiguous middle zone. The admin override on the
  // category itself takes precedence.
  badgeBgColor: 'light' | 'dark' | null;
}
const sdbLeagueDetailCache = new Map<string, { ts: number; data: SdbLeagueDetail }>();
const SDB_LEAGUE_DETAIL_TTL_MS = 6 * 60 * 60_000;

/**
 * Admin sports explorer — surfaces the data the regular scheduler hides:
 *  • What leagues are configured + their TheSportsDB IDs.
 *  • What matches are in the fixture cache per league (with pool-exists flag).
 *  • A one-click "Create pool" that bypasses the auto-scheduler's open-window
 *    guard, so the operator can spin up a pool for a match that's outside the
 *    normal 30-day window.
 *  • A "Refresh from SDB" trigger for a single league, so the operator can
 *    re-sync without waiting for the daily cron.
 *
 * All endpoints are mounted under `/api/admin/sports/`. Auth is handled by
 * the parent `adminRouter` (x-admin-key middleware).
 */
export const adminSportsRouter: RouterType = Router();

// ── GET /admin/sports/leagues ────────────────────────────────────────────────
// Returns all configured leagues (FOOTBALL_LEAGUE + SPORTSDB_SPORT) the
// scheduler knows about, annotated with the operator-relevant counts. PM
// categories are excluded (they have their own admin flow and a different
// concept of "match").
// GET /admin/sports/coverage — which sports the operator can create
// pools for, broken down by source so the admin can see WHY a sport
// is on/off the list. Three sources, evaluated in this order:
//
//   1. envOverride  → SPORTS_POOL_WHITELIST env var. Manual win.
//   2. observed     → distinct sport names from live_scores rows in
//                     the last 7 days. Self-healing: SDB stops
//                     covering a sport, it falls off; starts covering
//                     a new one, it gets added automatically.
//   3. bootstrap    → DEFAULT_LIVE_COVERED_SPORTS fallback. Only used
//                     when the API just started on a fresh DB and the
//                     livescore poller hasn't filled the table yet.
//
// `effective` is the actual allow-list the create-pool guard uses.
// `source` tells the UI which of the three rules won.
adminSportsRouter.get('/coverage', async (_req, res) => {
  try {
    const snapshot = await getCoverageSnapshot();
    res.json({
      success: true,
      data: {
        liveCovered: [...snapshot.effective],
        observed: [...snapshot.observed],
        envOverride: snapshot.envOverride ? [...snapshot.envOverride] : null,
        source: snapshot.source,
        cachedAt: snapshot.cachedAt,
        observationWindowDays: 7,
        knownSports: [
          'Soccer', 'Basketball', 'Baseball', 'Ice Hockey', 'American Football',
          'Fighting', 'Rugby', 'Tennis', 'Golf', 'Cricket', 'Boxing',
          'Motorsport', 'Esports', 'Cycling', 'Darts', 'Snooker',
          'Handball', 'Volleyball',
        ],
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

adminSportsRouter.get('/leagues', async (_req, res) => {
  try {
    const cats = await prisma.poolCategory.findMany({
      where: { type: { in: ['FOOTBALL_LEAGUE', 'SPORTSDB_SPORT'] } },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    });

    // Aggregate counts in one query each so the page loads in one round-trip
    // instead of N+1.
    const poolCounts = await prisma.pool.groupBy({
      by: ['league'],
      where: { poolType: 'SPORTS', league: { in: cats.map(c => c.code) } },
      _count: { _all: true },
    });
    const poolCountByLeague = new Map(poolCounts.map(r => [r.league!, r._count._all]));

    // Cached fixtures use sport=FOOTBALL for football leagues and sport=code
    // for other sports (see fixture-sync.ts).
    const cacheCounts = await prisma.$queryRaw<Array<{ league: string; sport: string; n: bigint }>>`
      SELECT league, sport, COUNT(*) AS n
      FROM sports_fixture_cache
      WHERE league = ANY(${cats.map(c => c.code)})
      GROUP BY league, sport
    `;
    const cacheCountByKey = new Map<string, number>();
    for (const r of cacheCounts) cacheCountByKey.set(`${r.sport}:${r.league}`, Number(r.n));

    const data = cats.map(c => {
      const cfg = (c.config || {}) as Record<string, unknown>;
      const sport = c.type === 'FOOTBALL_LEAGUE' ? 'FOOTBALL' : c.code;
      return {
        code: c.code,
        label: c.label,
        type: c.type,
        sport,
        enabled: c.enabled,
        comingSoon: c.comingSoon,
        externalLeagueId: typeof cfg.externalLeagueId === 'string' ? cfg.externalLeagueId
          : typeof cfg.theSportsDbLeagueId === 'string' ? cfg.theSportsDbLeagueId
          : null,
        sportQuery: typeof cfg.sportQuery === 'string' ? cfg.sportQuery : null,
        leagueFilter: typeof cfg.leagueFilter === 'string' ? cfg.leagueFilter : null,
        poolOpenDaysBefore: typeof cfg.poolOpenDaysBefore === 'number' ? cfg.poolOpenDaysBefore : null,
        // Top-level PoolCategory column. The sidebar uses this to render
        // the 18px badge preview next to the code chip; when null + an
        // externalLeagueId exists, the UI offers a 'fetch badge' link
        // that backfills via lookupleague.php.
        badgeUrl: c.badgeUrl ?? null,
        badgeBgColor: c.badgeBgColor ?? null,
        poolCount: poolCountByLeague.get(c.code) ?? 0,
        cachedMatchCount: cacheCountByKey.get(`${sport}:${c.code}`) ?? 0,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('[AdminSports] leagues error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── GET /admin/sports/sdb-league/:id ─────────────────────────────────────────
// Pull the rich league record from TheSportsDB (`lookupleague.php`), so the
// admin can fetch the badge URL when adding a new category or backfilling
// an existing one. Cached 6h per id — badge URLs change ~never.
adminSportsRouter.get('/sdb-league/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'league id required' } });

    const now = Date.now();
    const cached = sdbLeagueDetailCache.get(id);
    if (cached && now - cached.ts < SDB_LEAGUE_DETAIL_TTL_MS) {
      return res.json({ success: true, data: cached.data, cached: true });
    }

    const data = await sportsDbFetch(`lookupleague.php?id=${encodeURIComponent(id)}`);
    const row = Array.isArray(data?.leagues) && data.leagues.length > 0 ? data.leagues[0] : null;
    if (!row || !row.idLeague) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `SDB has no league with id=${id}` } });
    }
    const badge: string | null = row.strBadge || null;
    // Analyze the badge once and cache the result inside the league detail
    // — the 6h SDB cache already amortises the lookup, so we don't burn
    // SDB credits redundantly. classifyBadgeBackground swallows fetch /
    // decode errors and returns null so a flaky image never breaks the
    // endpoint.
    const badgeBgColor = badge ? await classifyBadgeBackground(badge) : null;
    const detail: SdbLeagueDetail = {
      id: String(row.idLeague),
      name: row.strLeague,
      sport: row.strSport || '',
      badge,
      logo: row.strLogo || null,
      country: row.strCountry || null,
      badgeBgColor,
    };
    sdbLeagueDetailCache.set(id, { ts: now, data: detail });
    res.json({ success: true, data: detail, cached: false });
  } catch (error) {
    console.error('[AdminSports] sdb-league error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── GET /admin/sports/matches?league=<code>[&direction=upcoming|past] ────────
// Reads from sports_fixture_cache (already populated by daily-sync), so this
// is fast and matches what the scheduler sees. Annotates each row with
// `poolExists` so the UI can hide the create button for ones already done.
const matchesQuery = z.object({
  league: z.string().min(1),
  direction: z.enum(['upcoming', 'past']).default('upcoming'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

adminSportsRouter.get('/matches', async (req, res) => {
  try {
    const parsed = matchesQuery.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: parsed.error.flatten() } });
    }
    const { league, direction, limit } = parsed.data;

    const cat = await prisma.poolCategory.findUnique({ where: { code: league } });
    if (!cat) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Unknown league code "${league}"` } });
    }
    const sport = cat.type === 'FOOTBALL_LEAGUE' ? 'FOOTBALL' : cat.code;

    const now = new Date();
    const matches = await prisma.sportsFixtureCache.findMany({
      where: {
        sport,
        league,
        kickoff: direction === 'upcoming' ? { gte: now } : { lt: now },
      },
      orderBy: { kickoff: direction === 'upcoming' ? 'asc' : 'desc' },
      take: limit,
    });

    // Pool-exists check in one batched query (avoids N+1).
    const matchIds = matches.map(m => m.externalId);
    const existingPools = await prisma.pool.findMany({
      where: { matchId: { in: matchIds }, poolType: 'SPORTS' },
      select: { id: true, matchId: true, status: true },
    });
    const poolByMatchId = new Map(existingPools.map(p => [p.matchId!, p]));

    const data = matches.map(m => ({
      externalId: m.externalId,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeTeamCrest: m.homeTeamCrest,
      awayTeamCrest: m.awayTeamCrest,
      kickoff: m.kickoff,
      status: m.status,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      leagueName: m.leagueName,
      matchday: m.matchday,
      pool: poolByMatchId.get(m.externalId) ?? null,
    }));

    res.json({ success: true, data: { sport, league, direction, count: data.length, matches: data } });
  } catch (error) {
    console.error('[AdminSports] matches error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── POST /admin/sports/backfill-fighter-images ───────────────────────────────
// One-shot trigger that walks combat-sport fixture cache rows whose
// home/away crest is null and resolves each fighter via SDB's
// searchplayers endpoint. New events synced after the fighter-images.ts
// commit already get enriched at upsert time — this is for the legacy
// rows. Idempotent and rate-limited; safe to run repeatedly.
adminSportsRouter.post('/backfill-fighter-images', async (_req, res) => {
  try {
    const r = await backfillCombatSportImages();
    res.json({ success: true, data: r });
  } catch (error) {
    console.error('[AdminSports] backfill-fighter-images error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── POST /admin/sports/refresh-league ────────────────────────────────────────
// Force a re-sync of one league from TheSportsDB right now, instead of
// waiting for the daily cron. Useful after the operator fixes a wrong
// externalLeagueId — they can see fresh rows appear in /matches immediately.
const refreshBody = z.object({ league: z.string().min(1) });

adminSportsRouter.post('/refresh-league', async (req, res) => {
  try {
    const parsed = refreshBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body' } });
    }
    const { league } = parsed.data;

    const cat = await prisma.poolCategory.findUnique({ where: { code: league } });
    if (!cat) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'League not found' } });
    if (cat.type !== 'FOOTBALL_LEAGUE' && cat.type !== 'SPORTSDB_SPORT') {
      return res.status(400).json({ success: false, error: { code: 'WRONG_TYPE', message: 'Only sport leagues can be refreshed via this endpoint' } });
    }

    const adapter = getAdapter(cat.code);
    const matches = await adapter.fetchUpcomingMatches(cat.code);
    const sport = cat.type === 'FOOTBALL_LEAGUE' ? 'FOOTBALL' : cat.code;

    // Same upsert shape as fixture-sync.ts. We intentionally don't go
    // through that file's upsertMatch because the whitelist guard there
    // already covers us (this path uses the same sport+league pair the
    // scheduler would).
    let upserted = 0;
    for (const m of matches) {
      try {
        await prisma.sportsFixtureCache.upsert({
          where: { externalId_sport_apiSource: { externalId: m.id, sport, apiSource: 'sports' } },
          create: {
            externalId: m.id, sport, league: cat.code, leagueName: m.leagueName,
            season: m.season ?? null, matchday: m.matchday ?? null,
            homeTeam: m.homeTeam, awayTeam: m.awayTeam,
            homeTeamCrest: m.homeTeamCrest ?? null, awayTeamCrest: m.awayTeamCrest ?? null,
            kickoff: m.kickoff, status: m.status,
            homeScore: m.homeScore ?? null, awayScore: m.awayScore ?? null,
            winner: null, apiSource: 'sports', lastSyncedAt: new Date(),
          },
          update: {
            homeTeam: m.homeTeam, awayTeam: m.awayTeam,
            homeTeamCrest: m.homeTeamCrest ?? null, awayTeamCrest: m.awayTeamCrest ?? null,
            kickoff: m.kickoff, status: m.status,
            homeScore: m.homeScore ?? null, awayScore: m.awayScore ?? null,
            matchday: m.matchday ?? null, lastSyncedAt: new Date(),
          },
        });
        upserted++;
      } catch { /* skip bad rows */ }
    }

    res.json({ success: true, data: { league: cat.code, fetched: matches.length, upserted } });
  } catch (error) {
    console.error('[AdminSports] refresh-league error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── POST /admin/sports/create-pool ───────────────────────────────────────────
// One-click "spin up a pool for this match" path. Bypasses the open-window
// guard the auto-scheduler enforces (so operators can create pools for
// matches that are weeks away). Still refuses duplicates.
const createBody = z.object({
  matchId: z.string().min(1),
  league: z.string().min(1),
});

adminSportsRouter.post('/create-pool', async (req, res) => {
  try {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body' } });
    }
    const { matchId, league } = parsed.data;

    const existing = await prisma.pool.findFirst({
      where: { matchId, poolType: 'SPORTS' },
      select: { id: true, status: true },
    });
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'POOL_EXISTS', message: `Pool already exists (id=${existing.id}, status=${existing.status})` } });
    }

    const cat = await prisma.poolCategory.findUnique({ where: { code: league } });
    if (!cat) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'League not found' } });

    const sport = cat.type === 'FOOTBALL_LEAGUE' ? 'FOOTBALL' : cat.code;
    const cacheRow = await prisma.sportsFixtureCache.findFirst({
      where: { externalId: matchId, sport, league },
    });
    if (!cacheRow) {
      return res.status(404).json({ success: false, error: { code: 'MATCH_NOT_CACHED', message: 'Match not found in fixture cache. Try Refresh from SDB first.' } });
    }

    // Same 3-layer guard the scheduler uses — admin manual creation
    // can't bypass the live-coverage whitelist or the SDB revalidation
    // check. Layer 1: scheduler is the same `getSportsDbConfigs` loop
    // so we check the SDB sport name here; Layer 2: fresh SDB lookup
    // for the event id catches the "fixture was synced last week,
    // event got moved or deleted since" case. Returning 4xx with the
    // reason in the body lets the UI surface "this match has no live
    // coverage" / "this match already finished" to the operator.
    const sdbSportName = cacheRow.sport;
    if (!(await isSportLiveCovered(sdbSportName))) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'SPORT_NOT_LIVE_COVERED',
          message: `${sdbSportName} has no observed live coverage. Wait for SDB to start broadcasting it (we re-check every 5 min) or set SPORTS_POOL_WHITELIST env to override.`,
        },
      });
    }
    const valid = await revalidateSdbEventBeforeCreation(matchId);
    if (!valid.ok && (valid.reason === 'finished' || valid.reason === 'in-progress' || valid.reason === 'not-found')) {
      return res.status(409).json({
        success: false,
        error: {
          code: `SDB_${valid.reason.replace('-', '_').toUpperCase()}`,
          message: `SDB says this match is ${valid.reason}${valid.detail ? ` (${valid.detail})` : ''}. Refresh from SDB and try again, or pick a different match.`,
        },
      });
    }

    // Build the Match shape createSportsPool expects. Football pools use
    // sport='FOOTBALL' across the cache/livescore stack (sports-scheduler
    // and fixture-cache filter on this); SPORTSDB_SPORT pools (NBA/NFL/etc)
    // use their own code as the sport identifier. The previous ternary
    // returned cat.code in both branches — dead code per Phase 1 #5.
    const match: Match = {
      id: cacheRow.externalId,
      sport: cat.type === 'FOOTBALL_LEAGUE' ? 'FOOTBALL' : cat.code,
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
      matchday: cacheRow.matchday ?? undefined,
    };

    const poolId = await createSportsPool(match, league);
    if (!poolId) {
      return res.status(500).json({ success: false, error: { code: 'CREATE_FAILED', message: 'Pool creation failed — check server logs' } });
    }

    await prisma.eventLog.create({
      data: {
        eventType: 'ADMIN_CREATE_SPORTS_POOL',
        entityType: 'pool',
        entityId: poolId,
        payload: { matchId, league, homeTeam: cacheRow.homeTeam, awayTeam: cacheRow.awayTeam, kickoff: cacheRow.kickoff.toISOString() },
      },
    }).catch(() => {});

    res.json({ success: true, data: { poolId, matchId, league } });
  } catch (error) {
    console.error('[AdminSports] create-pool error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── GET /admin/sports/sdb-leagues ────────────────────────────────────────────
// Full TheSportsDB leagues catalog (~1,475 rows) so the admin can browse what
// exists and add a new category without guessing IDs. Cached 10 min — the
// list changes monthly at most. Annotates each row with `inUse: true` when
// the SDB league id is already wired to one of our categories, so the UI
// can hide the Add button.
adminSportsRouter.get('/sdb-leagues', async (_req, res) => {
  try {
    const now = Date.now();
    if (!sdbLeaguesCache || now - sdbLeaguesCache.ts > SDB_LEAGUES_TTL_MS) {
      const data = await sportsDbFetch('all_leagues.php');
      const rows: Array<{ id: string; name: string; sport: string; alternate: string }> = [];
      for (const l of (data?.leagues || []) as Array<{ idLeague: string; strLeague: string; strSport: string; strLeagueAlternate?: string }>) {
        if (!l.idLeague || !l.strLeague) continue;
        rows.push({
          id: String(l.idLeague),
          name: l.strLeague,
          sport: l.strSport || '',
          alternate: l.strLeagueAlternate || '',
        });
      }
      sdbLeaguesCache = { ts: now, data: rows };
    }

    // Build the in-use set from the live category config so refreshing
    // categories doesn't bust the 10-min SDB cache.
    const cats = await prisma.poolCategory.findMany({
      where: { type: { in: ['FOOTBALL_LEAGUE', 'SPORTSDB_SPORT'] } },
      select: { code: true, config: true },
    });
    const inUseIds = new Set<string>();
    const inUseByExtId = new Map<string, string>(); // SDB id → our category code
    for (const c of cats) {
      const cfg = (c.config || {}) as Record<string, unknown>;
      const eid = (typeof cfg.externalLeagueId === 'string' ? cfg.externalLeagueId
        : typeof cfg.theSportsDbLeagueId === 'string' ? cfg.theSportsDbLeagueId
        : null);
      if (eid) { inUseIds.add(eid); inUseByExtId.set(eid, c.code); }
    }

    const enriched = sdbLeaguesCache.data.map(r => ({
      ...r,
      inUse: inUseIds.has(r.id),
      categoryCode: inUseByExtId.get(r.id) ?? null,
    }));

    res.json({
      success: true,
      data: {
        leagues: enriched,
        // PR 18 / Phase 5 — `cachedAt` was never consumed by the admin UI.
        // The 10-min cache is a backend implementation detail; clients
        // don't need to know the cache epoch.
        sportsCount: new Set(enriched.map(r => r.sport)).size,
      },
    });
  } catch (error) {
    console.error('[AdminSports] sdb-leagues error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── GET /admin/sports/stuck-knockouts ────────────────────────────────────────
// Lists CL/EL pools the Phase B grace-window logic intentionally leaves
// stuck: knockouts past expected end where SDB hasn't yet reported FT/AET/PEN,
// and Odds API's `completed: true` can't be trusted because it doesn't
// expose extra-time/penalty markers. Phase C surfaces a count gauge in the
// SourceSplitPanel; this endpoint feeds the actionable list under it.
//
// `minHoursOverdue` lets the admin focus on pools that have been waiting a
// while (defaults to 0 so everything past expected end shows up).
const stuckKnockoutsQuery = z.object({
  minHoursOverdue: z.coerce.number().min(0).max(72).default(0),
});

adminSportsRouter.get('/stuck-knockouts', async (req, res) => {
  try {
    const parsed = stuckKnockoutsQuery.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });
    }
    const { minHoursOverdue } = parsed.data;

    const knockoutLeagues = [...KNOCKOUT_DISABLE_ODDS_FALLBACK];
    const cutoff = new Date(Date.now() - minHoursOverdue * 3_600_000);

    const stuck = await prisma.pool.findMany({
      where: {
        poolType: 'SPORTS',
        status: { in: ['JOINING', 'ACTIVE'] },
        league: { in: knockoutLeagues },
        startTime: { lte: cutoff },
      },
      orderBy: { startTime: 'asc' },
      select: {
        id: true, matchId: true, league: true, homeTeam: true, awayTeam: true,
        homeTeamCrest: true, awayTeamCrest: true,
        startTime: true, status: true, homeScore: true, awayScore: true,
      },
    });

    // Bet counts per pool in one round-trip.
    const betCounts = await prisma.bet.groupBy({
      by: ['poolId'],
      where: { poolId: { in: stuck.map(p => p.id) } },
      _count: { _all: true },
    });
    const betCountByPool = new Map(betCounts.map(r => [r.poolId, r._count._all]));

    // Annotate each pool with the wall-clock minutes past expected end +
    // whether the grace window has elapsed (informational; admin still
    // decides the winner manually).
    const data = stuck.map(p => {
      const expectedEnd = p.startTime.getTime() + (EXPECTED_MATCH_DURATION_MS[p.league || ''] ?? DEFAULT_EXPECTED_DURATION_MS);
      const pastEndMs = Date.now() - expectedEnd;
      return {
        ...p,
        startTime: p.startTime.toISOString(),
        betCount: betCountByPool.get(p.id) ?? 0,
        minutesPastExpectedEnd: Math.max(0, Math.round(pastEndMs / 60_000)),
        graceWindowExpired: pastEndMs > ODDS_API_FT_FALLBACK_GRACE_MS,
      };
    });

    res.json({ success: true, data: { knockouts: data, count: data.length } });
  } catch (error) {
    console.error('[AdminSports] stuck-knockouts error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});

// ── POST /admin/sports/resolve-knockout ──────────────────────────────────────
// Admin-supplied resolution for a stuck CL/EL pool. The admin tells us who
// won at regulation time (90'), and we run the same on-chain
// resolve_with_winner path the auto-resolver uses + flip the DB row.
//
// regulationScore is optional but recommended — the public match page
// surfaces it so users see the score that resolved the pool, not a blank.
const resolveKnockoutBody = z.object({
  poolId: z.string().uuid(),
  winner: z.enum(['HOME', 'DRAW', 'AWAY']),
  regulationHomeScore: z.coerce.number().int().min(0).max(99).optional(),
  regulationAwayScore: z.coerce.number().int().min(0).max(99).optional(),
  reason: z.string().min(1).max(200).optional(),
});

const WINNER_TO_INDEX: Record<'HOME' | 'DRAW' | 'AWAY', 0 | 1 | 2> = {
  HOME: 0,
  AWAY: 1,
  DRAW: 2,
};

const WINNER_TO_LABEL: Record<'HOME' | 'DRAW' | 'AWAY', 'UP' | 'DOWN' | 'DRAW'> = {
  HOME: 'UP',
  AWAY: 'DOWN',
  DRAW: 'DRAW',
};

adminSportsRouter.post('/resolve-knockout', async (req, res) => {
  try {
    const parsed = resolveKnockoutBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body', details: parsed.error.flatten() } });
    }
    const { poolId, winner, regulationHomeScore, regulationAwayScore, reason } = parsed.data;

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pool not found' } });
    if (pool.poolType !== 'SPORTS' || !pool.league || !KNOCKOUT_DISABLE_ODDS_FALLBACK.has(pool.league)) {
      return res.status(400).json({ success: false, error: { code: 'NOT_KNOCKOUT', message: 'This endpoint is only for CL/EL knockout pools' } });
    }
    if (pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE') {
      return res.status(409).json({ success: false, error: { code: 'ALREADY_RESOLVED', message: `Pool is already ${pool.status}` } });
    }
    if (pool.numSides !== 3 && winner === 'DRAW') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_SIDE', message: 'DRAW only valid for 3-way pools' } });
    }

    const connection = getConnection();
    const wallet = getAuthorityKeypair();
    const seed = derivePoolSeed(pool.id);
    const [poolPda] = getPoolPDA(seed);

    // resolve_with_winner on-chain. Same idempotent-error handling as the
    // PM cancel + sports scheduler use elsewhere.
    let onChainResolved = false;
    try {
      const ix = buildResolveWithWinnerIx(poolPda, wallet.publicKey, WINNER_TO_INDEX[winner]);
      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      tx.sign(wallet);
      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      onChainResolved = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('InvalidPoolStatus') || msg.includes('0x177a') || msg.includes('AccountNotInitialized')) {
        // Already resolved on-chain in a previous attempt — proceed to DB sync.
        onChainResolved = true;
      } else if (msg.includes('AccountDidNotSerialize') || msg.includes('0xbbc')) {
        // Stale Pool layout (see bug_program_regression_per_side memory).
        // Mark DB anyway — pool with bets gets CLAIMABLE, no-bet pool will
        // be cleaned up by orphan recovery. No funds at risk: the only way
        // for users to claim is via the DB flag flipping.
        console.warn(`[AdminSports] Knockout ${poolId} has stale on-chain layout — resolving in DB only`);
      } else {
        console.error(`[AdminSports] On-chain resolve failed for ${poolId}:`, msg);
        return res.status(500).json({ success: false, error: { code: 'ONCHAIN_FAILED', message: msg } });
      }
    }

    const winnerLabel = WINNER_TO_LABEL[winner];
    await prisma.pool.update({
      where: { id: pool.id },
      data: {
        status: 'CLAIMABLE',
        winner: winnerLabel,
        finalPrice: BigInt(0),
        ...(regulationHomeScore != null ? { homeScore: regulationHomeScore } : {}),
        ...(regulationAwayScore != null ? { awayScore: regulationAwayScore } : {}),
      },
    });

    // Mirror to the fixture cache so the read-paths the rest of the app
    // uses (live_scores fallback chain, /match/[id] page) line up. The
    // admin endpoint only has pool.matchId in scope — sport / apiSource
    // would need to come from a join. Safest path is to look the cache
    // row up by primary key and update it directly, scoping by id (which
    // is unique) so we never bleed across data sources even if a
    // numeric externalId ever collides.
    const cacheRow = pool.matchId
      ? await prisma.sportsFixtureCache.findFirst({
          where: { externalId: pool.matchId },
          select: { id: true },
        })
      : null;
    if (cacheRow) {
      await prisma.sportsFixtureCache.update({
        where: { id: cacheRow.id },
        data: {
          status: 'FINISHED',
          winner: winner,
          ...(regulationHomeScore != null ? { homeScore: regulationHomeScore } : {}),
          ...(regulationAwayScore != null ? { awayScore: regulationAwayScore } : {}),
          lastSyncedAt: new Date(),
        },
      }).catch(() => {});
    }

    emitPoolStatus(pool.id, { id: pool.id, status: 'CLAIMABLE', winner: winnerLabel });

    await prisma.eventLog.create({
      data: {
        eventType: 'ADMIN_RESOLVE_KNOCKOUT',
        entityType: 'pool',
        entityId: pool.id,
        payload: {
          league: pool.league,
          winner,
          regulationScore: regulationHomeScore != null && regulationAwayScore != null
            ? `${regulationHomeScore}-${regulationAwayScore}`
            : null,
          reason: reason ?? 'manual-knockout-resolve',
          onChainResolved,
          note: 'CL/EL knockout manually resolved by admin per regulation-time rules (Phase B Decision 2: knockouts never auto-resolve via Odds API).',
        },
      },
    }).catch(() => {});

    console.log(`[AdminSports] Resolved knockout ${pool.homeTeam} vs ${pool.awayTeam} (${pool.league}) → ${winner}${onChainResolved ? '' : ' (DB only, on-chain layout stale)'}`);

    res.json({ success: true, data: { poolId, winner: winnerLabel, onChainResolved } });
  } catch (error) {
    console.error('[AdminSports] resolve-knockout error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});
