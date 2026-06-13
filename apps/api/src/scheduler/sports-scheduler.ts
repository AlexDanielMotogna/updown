import { prisma } from '../db';
import { suggestStuckPoolResults } from './result-suggestions';
import { getAdapter } from '../services/sports';
import type { Match, MatchResult } from '../services/sports/types';
import { notifyPoolResolved } from '../services/notifications';
import { getCachedUpcomingFixtures, getCachedFixtureResults, isFixtureCacheReady } from '../services/sports/fixture-cache';
import { getPoolPDA, getVaultPDA, buildInitializePoolIx, buildResolveWithWinnerIx, buildClosePoolIx } from 'solana-client';
import { derivePoolSeed, getUsdcMint, getConnection, getAuthorityKeypair } from '../utils/solana';
import { refundBettorOnChain } from './onchain-tx';
import { sendAndConfirm } from '../utils/onchain';
import { logEvent } from './resolver-types';
import { Transaction } from '@solana/web3.js';
import crypto from 'crypto';
import { emitPoolStatus } from '../websocket';
import { generateMatchAnalysis } from '../services/sports/match-analysis';
import { awardBetResolution } from '../services/rewards';
import {
  getFootballLeagueCodes, getSportsDbConfigs, getPolymarketCategories,
  getMatchDurationHours, getPoolOpenHoursForLeague,
} from '../services/category-config';
import { sweepStuckPmPools } from './pm-cancel';
import {
  isSportLiveCovered,
  revalidateSdbEventBeforeCreation,
  findZombieSportsPools,
  logZombieSportsPools,
} from '../services/sports/pool-validation';
const TX_DELAY_MS = 2_000; // 2s between on-chain transactions to avoid RPC 429s

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mutex: prevent concurrent createMatchPools calls (fixture-sync + polymarket-sync both call it at startup).
// _pendingRun: if a second call comes in while running, run once more after current finishes
// so we don't lose work (e.g. fixture-sync calling while polymarket-sync still holds the mutex).
let _creating = false;
let _pendingRun = false;

/** Derive the correct adapter based on the pool's league code. */
function getAdapterForLeague(league: string | null | undefined) {
  if (league?.startsWith('PM_')) return getAdapter('POLYMARKET');
  // Check if it's a registered sport adapter (NBA, NFL, MMA, NHL)
  try {
    return getAdapter(league || 'FOOTBALL');
  } catch {
    return getAdapter('FOOTBALL');
  }
}

/**
 * Create pools for upcoming matches that don't have pools yet.
 * Runs every 6 hours.
 */
export async function createMatchPools(): Promise<void> {
  if (_creating) {
    _pendingRun = true;
    console.log('[Sports] createMatchPools already running - queued follow-up run');
    return;
  }
  _creating = true;
  try {
    do {
      _pendingRun = false;
      await _createMatchPoolsInner();
    } while (_pendingRun);
  } finally {
    _creating = false;
  }
}

async function _createMatchPoolsInner(): Promise<void> {
  // ── Football leagues (only if fixture cache is ready) ──
  if (!isFixtureCacheReady()) {
    console.log('[Sports] Fixture cache not ready yet, skipping football pools');
  } else {
  const leagues = await getFootballLeagueCodes();
  for (const leagueCode of leagues) {
    try {
      const matches = await getCachedUpcomingFixtures('FOOTBALL', leagueCode);
      // Per-league window: defaults to 30 days, overridable from admin via
      // category.config.poolOpenDaysBefore. Read once per league so we don't
      // hit the cache for every match.
      const openHours = await getPoolOpenHoursForLeague(leagueCode);
      let created = 0, exists = 0, tooFar = 0, alreadyStarted = 0, sdbRejected = 0;

      for (const match of matches) {
        const existing = await prisma.pool.findFirst({
          where: { matchId: match.id, poolType: 'SPORTS' },
        });
        if (existing) { exists++; continue; }

        const hoursUntilKickoff = (match.kickoff.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilKickoff < 0) { alreadyStarted++; continue; }
        if (hoursUntilKickoff > openHours) { tooFar++; continue; }

        // Layer 2 — football fixtures come from football-data.org but we
        // still cross-validate against SDB when possible. Football matches
        // typically have idEvent populated via the sync, so the lookup
        // works. Non-existent / past events get rejected the same way.
        const valid = await revalidateSdbEventBeforeCreation(match.id);
        if (!valid.ok) {
          // Only reject for terminal reasons. 'not-found' / 'malformed'
          // are tolerated for football because football-data.org IDs
          // sometimes don't match an SDB lookup; we trust the
          // football-data feed for those.
          if (valid.reason === 'finished' || valid.reason === 'in-progress') {
            console.warn(`[Sports] ${leagueCode}: SDB says ${match.id} is ${valid.reason} (${valid.detail ?? ''}) — skipping`);
            sdbRejected++;
            continue;
          }
        }

        await createSportsPool(match, leagueCode);
        created++;
        await sleep(TX_DELAY_MS);
      }
      if (matches.length > 0) {
        console.log(`[Sports] ${leagueCode}: ${matches.length} cached → created=${created} exists=${exists} too-far(>${openHours / 24}d)=${tooFar} kickoff-passed=${alreadyStarted} sdb-rejected=${sdbRejected}`);
      }
    } catch (error) {
      console.error(`[Sports] Failed to fetch matches for ${leagueCode}:`, error);
    }
  }
  } // end isFixtureCacheReady

  // ── Polymarket categories (independent of football cache) ──
  const pmCategories = await getPolymarketCategories();
  for (const cat of pmCategories) {
    try {
      const matches = await getCachedUpcomingFixtures('POLYMARKET', cat.code);
      const maxHours = cat.maxDaysAhead * 24;

      for (const match of matches) {
        // Match on matchId only — catches both legacy PM pools (poolType SPORTS)
        // and new ones (poolType POLYMARKET) so we never double-create.
        const existing = await prisma.pool.findFirst({
          where: { matchId: match.id },
        });
        if (existing) continue;

        const hoursUntilKickoff = (match.kickoff.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilKickoff > maxHours || hoursUntilKickoff < 0) continue;

        await createSportsPool(match, cat.code);
        await sleep(TX_DELAY_MS);
      }
    } catch (error) {
      console.error(`[Sports] Failed to create PM pools for ${cat.code}:`, error);
    }
  }

  // ── Other sports (dynamic from DB config) ──
  const sportsConfigs = await getSportsDbConfigs();
  for (const config of sportsConfigs) {
    // Layer 1 — dynamic sport whitelist. isSportLiveCovered now reads
    // from the live_scores table (sports we've observed broadcasting
    // in the last 7 days) with env / bootstrap fallbacks. Tennis /
    // Golf / Cricket etc. fall out naturally because they never
    // appear in /livescore/all, not because they're hardcoded.
    if (!(await isSportLiveCovered(config.sport))) {
      console.log(`[Sports] ${config.sport}: skipped — no observed live coverage in the last 7 days`);
      continue;
    }
    try {
      const matches = await getCachedUpcomingFixtures(config.sport, config.sport);
      // Per-sport window: same admin-tunable knob as football leagues.
      const openHours = await getPoolOpenHoursForLeague(config.sport);
      let created = 0, exists = 0, tooFar = 0, alreadyStarted = 0, sdbRejected = 0;

      for (const match of matches) {
        const existing = await prisma.pool.findFirst({
          where: { matchId: match.id, poolType: 'SPORTS' },
        });
        if (existing) { exists++; continue; }

        const hoursUntilKickoff = (match.kickoff.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilKickoff < 0) { alreadyStarted++; continue; }
        if (hoursUntilKickoff > openHours) { tooFar++; continue; }

        // Layer 2 — re-validate against SDB right before pool creation.
        // Catches the "cache row stale, event got deleted/moved" case.
        const valid = await revalidateSdbEventBeforeCreation(match.id);
        if (!valid.ok) {
          console.warn(`[Sports] ${config.sport}: SDB rejected ${match.id} (${valid.reason}${valid.detail ? `: ${valid.detail}` : ''}) — skipping pool creation`);
          sdbRejected++;
          continue;
        }

        await createSportsPool(match, config.sport);
        created++;
        await sleep(TX_DELAY_MS);
      }
      if (matches.length > 0) {
        console.log(`[Sports] ${config.sport}: ${matches.length} cached → created=${created} exists=${exists} too-far(>${openHours / 24}d)=${tooFar} kickoff-passed=${alreadyStarted} sdb-rejected=${sdbRejected}`);
      }
    } catch (error) {
      console.error(`[Sports] Failed to create ${config.sport} pools:`, error);
    }
  }
}

/**
 * Safety net: force-check all overdue pools (kickoff >3h ago, still unresolved).
 * Bypasses the normal API_LOOKUP_LIMIT since these are clearly stuck.
 * Runs every 15 minutes.
 */
async function sweepUnresolvedPools(): Promise<void> {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const overdue = await prisma.pool.findMany({
    where: {
      poolType: 'SPORTS',
      status: { in: ['ACTIVE', 'JOINING'] },
      matchId: { not: null },
      startTime: { lte: threeHoursAgo },
    },
  });

  if (overdue.length === 0) return;

  console.warn(`[Sports] SWEEP: ${overdue.length} overdue pool(s) - force-checking all APIs`);
  const matchIds = [...new Set(overdue.map(p => p.matchId!).filter(Boolean))];
  const resultMap = await getCachedFixtureResults(matchIds);

  for (const pool of overdue) {
    if (!pool.matchId) continue;
    const result = resultMap.get(pool.matchId);
    if (!result) {
      console.warn(`[Sports] SWEEP: ${pool.matchId} (${pool.homeTeam} vs ${pool.awayTeam}) - still no result after 3h+`);
      continue;
    }

    try {
      const adapter = getAdapterForLeague(pool.league);
      const winnerSide = adapter.resolveWinner(result);

      await prisma.pool.update({
        where: { id: pool.id },
        data: { homeScore: result.homeScore, awayScore: result.awayScore },
      });

      const betCount = await prisma.bet.count({ where: { poolId: pool.id } });
      console.log(`[Sports] SWEEP: Resolving ${pool.homeTeam} vs ${pool.awayTeam} (${result.homeScore}-${result.awayScore}, ${betCount} bets)`);

      // Delegate to the normal resolver (same logic)
      await resolveMatchPools();
      return; // Let the normal resolver handle all remaining
    } catch (error) {
      console.error(`[Sports] SWEEP: Failed to resolve ${pool.id}:`, error);
    }
  }
}

/**
 * Check finished matches and resolve their pools.
 * Runs every 2 minutes. Does NOT rely on endTime - only checks the real match result from API.
 */
/**
 * Void a sports pool whose match was cancelled / postponed / abandoned: refund
 * every bettor their OWN stake (via refund_bettor — fair for multi-side pools),
 * then mark the pool CANCELLED and best-effort reclaim its rent on-chain.
 * Aborts (and retries next cycle) if any refund can't land, so we never mark a
 * pool CANCELLED with bettors still unpaid.
 */
export async function voidSportsPool(
  pool: { id: string; homeTeam: string | null; awayTeam: string | null },
  reason: string,
): Promise<void> {
  const bets = await prisma.bet.findMany({
    where: { poolId: pool.id, claimed: false },
    select: { id: true, walletAddress: true, side: true, amount: true },
  });

  const wallet = getAuthorityKeypair();
  const connection = getConnection();
  const deps = { prisma, connection, wallet, priceProvider: null as any };

  // 1) Refund each bettor their principal.
  for (const bet of bets) {
    try {
      const sig = await refundBettorOnChain(deps, pool.id, bet.walletAddress, bet.side);
      await prisma.bet.update({ where: { id: bet.id }, data: { claimed: true, payoutAmount: bet.amount, claimTx: sig } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('AlreadyClaimed') || msg.includes('0xbc4') || msg.includes('AccountNotInitialized')) {
        // Already refunded / closed — treat as settled and continue.
        await prisma.bet.updateMany({ where: { id: bet.id, claimed: false }, data: { claimed: true } });
      } else {
        console.warn(`[Sports] void refund failed for bet ${bet.id} (${pool.id}) — will retry:`, msg);
        return; // don't mark CANCELLED while a bettor is still owed
      }
    }
    await new Promise(r => setTimeout(r, TX_DELAY_MS));
  }

  // 2) Best-effort rent reclaim: resolve (arbitrary) then close the now-empty
  //    pool. Non-fatal — orphan recovery can sweep the husk later.
  const seed = derivePoolSeed(pool.id);
  const [poolPda] = getPoolPDA(seed);
  const [vaultPda] = getVaultPDA(seed);
  try {
    await sendAndConfirm(buildResolveWithWinnerIx(poolPda, wallet.publicKey, 0), wallet, { label: 'resolve(void)' });
    await sendAndConfirm(buildClosePoolIx(poolPda, vaultPda, wallet.publicKey), wallet, { label: 'close_pool(void)' });
  } catch (e) {
    console.warn(`[Sports] void: rent reclaim deferred for ${pool.id}:`, e instanceof Error ? e.message : e);
  }

  // 3) Mark CANCELLED (null winner so the UI shows "cancelled", not a win/loss).
  await prisma.pool.update({ where: { id: pool.id }, data: { status: 'CANCELLED', winner: null, finalPrice: BigInt(0) } });
  emitPoolStatus(pool.id, { id: pool.id, status: 'CANCELLED' });
  await logEvent(prisma, 'POOL_VOID_REFUNDED', 'pool', pool.id, { reason, bets: bets.length.toString() });
  console.log(`[Sports] VOID + refunded ${bets.length} bet(s): ${pool.homeTeam} vs ${pool.awayTeam} (${reason})`);
}

/** One row from the unresolved-pools query (full Prisma Pool). */
type SportsPool = Awaited<ReturnType<typeof prisma.pool.findMany>>[number];

/**
 * Orchestrator: find SPORTS pools whose kickoff has passed, batch-read their
 * results from cache (0 API calls), then dispatch each to void (cancelled /
 * postponed) or resolve (finished). One pool failing never blocks the rest.
 */
export async function resolveMatchPools(): Promise<void> {
  const unresolved = await prisma.pool.findMany({
    where: {
      poolType: 'SPORTS',
      status: { in: ['ACTIVE', 'JOINING'] },
      matchId: { not: null },
      startTime: { lte: new Date() }, // Kickoff has passed
    },
  });

  if (unresolved.length === 0) return;

  // Batch read all results from cache (0 API calls!)
  const matchIds = [...new Set(unresolved.map((p: { matchId: string | null }) => p.matchId!).filter(Boolean))] as string[];
  const resultMap = await getCachedFixtureResults(matchIds);

  // Also read the raw cache status so we can VOID (cancel + refund) pools whose
  // match was cancelled / postponed / abandoned — those never produce a FINISHED
  // result, so without this they'd sit open forever and become zombies.
  const statusRows = await prisma.sportsFixtureCache.findMany({
    where: { externalId: { in: matchIds } },
    select: { externalId: true, status: true },
  });
  const statusByMatch = new Map(statusRows.map(r => [r.externalId, r.status]));

  for (const pool of unresolved) {
    if (!pool.matchId) continue;

    try {
      const result = resultMap.get(pool.matchId);
      if (!result) {
        // No finished result — void the pool if the match was cancelled /
        // postponed / abandoned (mapped to CANCELLED/POSTPONED at ingest).
        const matchStatus = statusByMatch.get(pool.matchId);
        if (matchStatus === 'CANCELLED' || matchStatus === 'POSTPONED') {
          await voidSportsPool(pool, matchStatus).catch(e =>
            console.warn(`[Sports] void failed for ${pool.id}:`, e instanceof Error ? e.message : e));
        }
        continue; // Match not finished yet (or just voided) - skip
      }

      await resolveFinishedPool(pool, result);
    } catch (error) {
      console.error(`[Sports] Failed to resolve pool ${pool.id}:`, error);
    }
  }
}

/**
 * Resolve a single pool whose match has FINISHED: write the final score, then
 * either close it (no bets → reclaim rent) or resolve it on-chain (has bets →
 * unlock payouts + award XP). Throws on unknown on-chain errors so the caller's
 * per-pool catch logs them and moves on.
 */
async function resolveFinishedPool(pool: SportsPool, result: MatchResult): Promise<void> {
  const adapter = getAdapterForLeague(pool.league);
  const winnerSide = adapter.resolveWinner(result);
  const winnerLabel = (['UP', 'DOWN', 'DRAW'] as const)[winnerSide];

  // Always update scores immediately so the UI shows the final result
  await prisma.pool.update({
    where: { id: pool.id },
    data: { homeScore: result.homeScore, awayScore: result.awayScore },
  });

  // Check if pool has any bets
  const betCount = await prisma.bet.count({ where: { poolId: pool.id } });
  const wallet = getAuthorityKeypair();

  if (betCount === 0) {
    await closeEmptyResolvedPool(pool, result, winnerSide, winnerLabel);
    return;
  }

  // Pool has bets - resolve on-chain
  const seed = derivePoolSeed(pool.id);
  const [poolPda] = getPoolPDA(seed);

  const ix = buildResolveWithWinnerIx(poolPda, wallet.publicKey, winnerSide as 0 | 1 | 2);

  try {
    await sendAndConfirm(ix, wallet, { label: 'resolve_with_winner' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('InvalidPoolStatus') || msg.includes('0x177a') || msg.includes('AccountNotInitialized')) {
      // Already resolved on-chain (a previous tick succeeded but DB
      // update raced) — fall through to DB write below to sync state.
    } else if (msg.includes('AccountDidNotSerialize') || msg.includes('0xbbc')) {
      // Stale Pool struct layout on a pool WITH bets: do NOT auto-resolve.
      // Funds are in the vault; admin needs to refund via admin → Manual
      // Actions → Force Refund Pool, which uses synthetic prices and the
      // existing autoRefundBets path. Log loudly so it shows up in
      // monitoring.
      console.error(`[Sports] STALE-LAYOUT pool with bets needs admin refund: ${pool.id} (${pool.homeTeam} vs ${pool.awayTeam}, ${betCount} bets)`);
      return;
    } else {
      throw err; // Unknown error — let outer catch log it and try next pool.
    }
  }

  await prisma.pool.update({
    where: { id: pool.id },
    data: { status: 'RESOLVED', winner: winnerLabel, finalPrice: BigInt(0) },
  });

  emitPoolStatus(pool.id, { id: pool.id, status: 'RESOLVED', winner: winnerLabel });
  notifyPoolResolved({ ...pool, winner: winnerLabel }).catch(() => {});

  // Award participation XP to every bettor of this resolved match. Outcome is
  // real-world (not farmable). Mirrors the crypto resolver.
  const xpBettors = await prisma.bet.findMany({ where: { poolId: pool.id }, select: { walletAddress: true } });
  const xpWallets = [...new Set(xpBettors.map((b) => b.walletAddress))];
  await Promise.all(xpWallets.map((wallet) => awardBetResolution(wallet)));

  console.log(`[Sports] Resolved ${pool.homeTeam} vs ${pool.awayTeam}: ${result.homeScore}-${result.awayScore} → ${winnerLabel} (${betCount} bets)`);
}

/**
 * Close a finished pool that has NO bets: resolve it on-chain so close_pool can
 * reclaim rent (prevents orphans), then mark RESOLVED in the DB. Tolerates a
 * stale on-chain layout by marking the DB row RESOLVED anyway (orphan recovery
 * sweeps the husk later); on an unknown on-chain error it skips the DB update so
 * the next cycle retries.
 */
async function closeEmptyResolvedPool(
  pool: SportsPool,
  result: MatchResult,
  winnerSide: number,
  winnerLabel: 'UP' | 'DOWN' | 'DRAW',
): Promise<void> {
  const wallet = getAuthorityKeypair();
  // Resolve on-chain so close_pool can reclaim rent (prevents orphans)
  const seed = derivePoolSeed(pool.id);
  const [poolPda] = getPoolPDA(seed);
  // Whether we managed to flip the on-chain account to Resolved. False
  // when the on-chain account uses a stale Pool struct layout (a few
  // legacy pools from the devnet broken-binary window — see
  // `bug_program_regression_per_side`); in that case we still mark the
  // DB row as RESOLVED with the off-chain result, and orphan recovery
  // reclaims the rent from the on-chain husk later.
  let onChainResolved = false;

  try {
    await sendAndConfirm(buildResolveWithWinnerIx(poolPda, wallet.publicKey, winnerSide as 0 | 1 | 2), wallet, { label: 'resolve_with_winner' });
    onChainResolved = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('InvalidPoolStatus') || msg.includes('0x177a') || msg.includes('AccountNotInitialized')) {
      // Already resolved / already closed on-chain — proceed to DB update.
      onChainResolved = true;
    } else if (msg.includes('AccountDidNotSerialize') || msg.includes('0xbbc')) {
      // Stale Pool struct layout — the on-chain account was created by
      // an older program version whose serialization doesn't match the
      // current one. No funds at risk (0 bets, vault empty), so we
      // mark the DB row RESOLVED so the UI shows the result; the
      // on-chain husk gets cleaned up by recoverOrphanedPools later
      // (admin → Manual Actions → Recover Orphaned Pools).
      console.warn(`[Sports] Empty pool ${pool.id} has stale on-chain layout — resolving in DB only (orphan recovery will reclaim rent)`);
    } else {
      console.warn(`[Sports] Failed to resolve empty pool ${pool.id} on-chain - will retry:`, msg);
      return; // Don't mark as RESOLVED, will retry next cycle
    }
  }

  await prisma.pool.update({
    where: { id: pool.id },
    data: { status: 'RESOLVED', winner: winnerLabel, finalPrice: BigInt(0) },
  });
  emitPoolStatus(pool.id, { id: pool.id, status: 'RESOLVED', winner: winnerLabel });
  console.log(`[Sports] Resolved (empty${onChainResolved ? '' : ', DB-only stale-layout'}) ${pool.homeTeam} vs ${pool.awayTeam}: ${result.homeScore}-${result.awayScore} → ${winnerLabel}`);
}

/**
 * Create a sports/PM pool for one match. Returns the pool UUID on success,
 * `null` if the on-chain tx failed and the DB row was rolled back. Doesn't
 * check the `hoursUntilKickoff` window — the scheduler wraps this call with
 * its own guard, the admin one-click path intentionally bypasses it so
 * operators can spin up out-of-window pools manually.
 */
export async function createSportsPool(match: Match, leagueCode: string): Promise<string | null> {
  const poolId = crypto.randomUUID();
  const asset = `${leagueCode}:${match.homeTeam}-${match.awayTeam}`.slice(0, 32);
  const adapter = getAdapterForLeague(leagueCode);
  const isPolymarket = leagueCode.startsWith('PM_');

  const kickoff = match.kickoff;
  const durationHours = await getMatchDurationHours(leagueCode);
  const durationMs = durationHours * 60 * 60 * 1000;
  const interval = isPolymarket ? 'prediction' : 'match';

  let startTime: Date, lockTime: Date, endTime: Date, durationSeconds: number;
  if (isPolymarket) {
    // PM time model: bet from NOW → lock shortly before the market's deadline
    // (endDate) → pool ends at the deadline; resolution happens after, on-chain
    // via CTF. The old model set startTime = endDate, which put lockTime
    // (endDate−1h) BEFORE startTime — an inverted, nonsensical window.
    const endDate = kickoff; // cache.kickoff == market.endDate for PM
    const now = new Date();
    const PM_LOCK_BUFFER_MS = 60 * 60 * 1000; // close betting 1h before the deadline
    startTime = now;
    lockTime = new Date(endDate.getTime() - PM_LOCK_BUFFER_MS);
    endTime = endDate;
    durationSeconds = Math.max(1, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));
    if (lockTime.getTime() <= now.getTime()) {
      // Deadline is within the lock buffer — no meaningful betting window left.
      console.warn(`[PM] Skipping ${match.id}: endDate too close (lockTime <= now)`);
      return null;
    }
  } else {
    lockTime = new Date(kickoff.getTime() - 60 * 1000); // Sports: lock 1min before kickoff
    startTime = kickoff;
    endTime = new Date(kickoff.getTime() + durationMs);
    durationSeconds = durationHours * 60 * 60;
  }

  try {
    const connection = getConnection();
    const wallet = getAuthorityKeypair();
    const seed = derivePoolSeed(poolId);
    const [poolPda] = getPoolPDA(seed);
    const [vaultPda] = getVaultPDA(seed);
    const usdcMint = getUsdcMint();

    // Look up cache entry for extra fields (marketOdds, clobTokenIds)
    const cacheEntry = isPolymarket
      ? await prisma.sportsFixtureCache.findFirst({ where: { externalId: match.id, sport: 'POLYMARKET' } })
      : null;

    // ── DB-first: insert before on-chain to prevent orphans ──
    await prisma.pool.create({
      data: {
        id: poolId,
        poolId: poolPda.toBase58(),
        asset,
        interval,
        durationSeconds,
        status: 'JOINING',
        startTime,
        endTime,
        lockTime,
        strikePrice: BigInt(0),
        totalUp: BigInt(0),
        totalDown: BigInt(0),
        totalDraw: BigInt(0),
        numSides: adapter.numSides,
        poolType: isPolymarket ? 'POLYMARKET' : 'SPORTS',
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeTeamCrest: match.homeTeamCrest || null,
        awayTeamCrest: match.awayTeamCrest || null,
        league: leagueCode,
        marketOdds: cacheEntry?.marketOdds ?? null,
        clobTokenIds: cacheEntry?.clobTokenIds ?? null,
        conditionId: cacheEntry?.conditionId ?? null, // CTF settlement key (survives Gamma delisting)
        matchAnalysis: cacheEntry?.groupItemTitle ?? null, // PM description/rules
        tags: cacheEntry?.tags ?? null,
        subcategory: cacheEntry?.subcategory ?? null,
      },
    });

    // Create on-chain
    const ix = buildInitializePoolIx(
      poolPda,
      vaultPda,
      usdcMint,
      wallet.publicKey,
      seed,
      asset,
      Math.floor(startTime.getTime() / 1000),
      Math.floor(endTime.getTime() / 1000),
      Math.floor(lockTime.getTime() / 1000),
      BigInt(0),
      adapter.numSides,
    );

    try {
      await sendAndConfirm(ix, wallet, { label: 'initialize_pool(sports)' });
    } catch (chainError) {
      // The init tx may have LANDED on-chain even though confirmation threw
      // (429 / timeout). Rolling back then would orphan the pool. Verify on-chain
      // first: only roll back the DB row if the pool truly is not on-chain.
      let existsOnChain = true;
      try { existsOnChain = (await connection.getAccountInfo(poolPda)) !== null; }
      catch { /* RPC unsure — keep the row to be safe */ }
      if (!existsOnChain) {
        await prisma.pool.delete({ where: { id: poolId } }).catch(e => console.warn('[Sports] DB rollback failed:', e instanceof Error ? e.message : e));
        console.warn(`[Sports] On-chain creation failed (pool not on-chain), rolled back DB row ${poolId}`);
        throw chainError;
      }
      console.warn(`[Sports] init confirmation errored but pool ${poolId} exists on-chain — keeping DB row to avoid orphan`);
    }

    console.log(`[Sports] Created pool for ${match.homeTeam} vs ${match.awayTeam} (${leagueCode}, kickoff: ${kickoff.toISOString()})`);

    // Generate match analysis in background (non-blocking)
    if (!isPolymarket) {
      generateMatchAnalysis(match.id, match.homeTeam, match.awayTeam, leagueCode)
        .then(analysis => {
          if (analysis) {
            prisma.pool.update({ where: { id: poolId }, data: { matchAnalysis: analysis } })
              .then(() => console.log(`[Sports] Analysis saved for ${match.homeTeam} vs ${match.awayTeam}`))
              .catch(e => console.warn('[Sports] Analysis save failed:', e instanceof Error ? e.message : e));
          }
        })
        .catch(e => console.warn('[Sports] Analysis generation failed:', e instanceof Error ? e.message : e));
    }

    return poolId;
  } catch (error) {
    console.error(`[Sports] Failed to create pool for ${match.homeTeam} vs ${match.awayTeam}:`, error);
    return null;
  }
}

/**
 * Start the sports scheduler with cron jobs.
 */
export function startSportsScheduler(): void {
  // Create match pools every 2 hours
  const createInterval = setInterval(async () => {
    try {
      await createMatchPools();
    } catch (error) {
      console.error('[Sports] Scheduler create error:', error);
    }
  }, 2 * 60 * 60 * 1000);

  // Resolve finished matches every 2 minutes
  const resolveInterval = setInterval(async () => {
    try {
      await resolveMatchPools();
    } catch (error) {
      console.error('[Sports] Scheduler resolve error:', error);
    }
  }, 2 * 60 * 1000);

  // Safety net: sweep overdue pools every 15 minutes (kickoff >3h ago, still unresolved)
  setInterval(async () => {
    try {
      await sweepUnresolvedPools();
    } catch (error) {
      console.error('[Sports] Sweep error:', error);
    }
    try {
      // PM pools have a separate fate (UMA can stall for days, markets can be
      // delisted from Gamma). sweepStuckPmPools auto-cancels 0-bet pools past
      // the grace window; pools with bets are left for admin to cancel.
      await sweepStuckPmPools();
    } catch (error) {
      console.error('[Sports] PM sweep error:', error);
    }
    try {
      // For sports pools TheSportsDB never resolved, ask the web-search LLM and
      // queue a PENDING suggestion for admin review (never auto-resolves).
      await suggestStuckPoolResults();
    } catch (error) {
      console.error('[Sports] Result-suggestion error:', error);
    }
  }, 15 * 60 * 1000);

  // Layer 3 — Zombie sports pool audit, every 30 minutes. Finds pools
  // whose `lockTime + 2 × expected duration` is past with no live_score
  // row. Logs to event_log so the admin dashboard can surface them.
  // Doesn't auto-cancel — the operator decides what to do (force
  // refund / delete) because the bet count might be > 0.
  setInterval(async () => {
    try {
      const zombies = await findZombieSportsPools();
      if (zombies.length > 0) {
        console.warn(`[Sports] ZOMBIE AUDIT: ${zombies.length} pool(s) past expected end without live scores`);
        for (const z of zombies) {
          console.warn(`  [${z.id.slice(0, 8)}] ${z.league} ${z.homeTeam} vs ${z.awayTeam} — ${z.hoursOverdue}h overdue, ${z.betCount} bet(s)`);
        }
        await logZombieSportsPools(zombies);
      }
    } catch (error) {
      console.error('[Sports] Zombie audit error:', error);
    }
  }, 30 * 60 * 1000);

  // Initial pool creation is handled by fixture-sync.ts after dailySync completes.
  // Do NOT call createMatchPools() here to avoid duplicate pool creation.

  // Resolve any stuck pools 15s after startup (gives livescore poll time to populate)
  setTimeout(() => {
    resolveMatchPools().catch(e => console.error('[Sports] Initial resolve error:', e));
  }, 15_000);

  console.log('[Sports] Scheduler started (create: 2h, resolve: 2m, sweep: 15m, zombie audit: 30m, initial resolve: 15s)');
}
