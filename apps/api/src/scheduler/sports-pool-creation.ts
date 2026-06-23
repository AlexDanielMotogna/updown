import { prisma } from '../db';
import type { Match } from '../services/sports/types';
import { getCachedUpcomingFixtures, isFixtureCacheReady } from '../services/sports/fixture-cache';
import { getPoolPDA, getVaultPDA, buildInitializePoolIx } from 'solana-client';
import { derivePoolSeed, getUsdcMint, getConnection, getAuthorityKeypair } from '../utils/solana';
import { sendAndConfirm } from '../utils/onchain';
import crypto from 'crypto';
import { generateMatchAnalysis } from '../services/sports/match-analysis';
import {
  getFootballLeagueCodes, getSportsDbConfigs, getPolymarketCategories,
  getMatchDurationHours, getPoolOpenHoursForLeague,
} from '../services/category-config';
import { isSportLiveCovered, revalidateSdbEventBeforeCreation } from '../services/sports/pool-validation';
import { getAdapterForLeague, sleep, TX_DELAY_MS } from './sports-shared';

// Mutex: prevent concurrent createMatchPools calls (fixture-sync + polymarket-sync both call it at startup).
// _pendingRun: if a second call comes in while running, run once more after current finishes
// so we don't lose work (e.g. fixture-sync calling while polymarket-sync still holds the mutex).
let _creating = false;
let _pendingRun = false;

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
 * Create a sports/PM pool for one match. Returns the pool UUID on success,
 * `null` if the on-chain tx failed and the DB row was rolled back. Doesn't
 * check the `hoursUntilKickoff` window — the scheduler wraps this call with
 * its own guard, the admin one-click path intentionally bypasses it so
 * operators can spin up out-of-window pools manually.
 */
export async function createSportsPool(match: Match, leagueCode: string): Promise<string | null> {
  const poolId = crypto.randomUUID();
  // On-chain `asset` is #[max_len(32)] = 32 BYTES (Borsh), not chars. Truncate by
  // UTF-8 byte length — `.slice(0, 32)` cut by chars, so a title with multi-byte
  // chars (curly quote ’, %, emoji…) exceeded 32 bytes and failed InitializePool
  // with AccountDidNotSerialize (0xbbc).
  let asset = `${leagueCode}:${match.homeTeam}-${match.awayTeam}`;
  while (Buffer.byteLength(asset, 'utf8') > 32) asset = asset.slice(0, -1);
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
