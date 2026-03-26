import { prisma } from '../db';
import { getAdapter } from '../services/sports';
import type { Match } from '../services/sports/types';
import { getCachedUpcomingFixtures, getCachedFixtureResults, isFixtureCacheReady } from '../services/sports/fixture-cache';
import { getPoolPDA, getVaultPDA, buildInitializePoolIx, buildResolveWithWinnerIx } from 'solana-client';
import { derivePoolSeed, getUsdcMint, getConnection, getAuthorityKeypair } from '../utils/solana';
import { Transaction } from '@solana/web3.js';
import crypto from 'crypto';
import { emitPoolStatus } from '../websocket';
import { generateMatchAnalysis } from '../services/sports/match-analysis';
import { getFootballLeagueCodes, getSportsDbConfigs, getPolymarketCategories } from '../services/category-config';
const POOL_OPEN_HOURS_BEFORE = 720; // Open pool 30 days before kickoff

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
  // ── Football leagues (only if fixture cache is ready) ──
  if (!isFixtureCacheReady()) {
    console.log('[Sports] Fixture cache not ready yet, skipping football pools');
  } else {
  const leagues = await getFootballLeagueCodes();
  for (const leagueCode of leagues) {
    try {
      const matches = await getCachedUpcomingFixtures('FOOTBALL', leagueCode);

      for (const match of matches) {
        const existing = await prisma.pool.findFirst({
          where: { matchId: match.id, poolType: 'SPORTS' },
        });
        if (existing) continue;

        const hoursUntilKickoff = (match.kickoff.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilKickoff > POOL_OPEN_HOURS_BEFORE || hoursUntilKickoff < 0) continue;

        await createSportsPool(match, leagueCode);
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
        const existing = await prisma.pool.findFirst({
          where: { matchId: match.id, poolType: 'SPORTS' },
        });
        if (existing) continue;

        const hoursUntilKickoff = (match.kickoff.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilKickoff > maxHours || hoursUntilKickoff < 0) continue;

        await createSportsPool(match, cat.code);
      }
    } catch (error) {
      console.error(`[Sports] Failed to create PM pools for ${cat.code}:`, error);
    }
  }

  // ── TheSportsDB (dynamic from DB config) ──
  const sportsConfigs = await getSportsDbConfigs();
  for (const config of sportsConfigs) {
    try {
      const matches = await getCachedUpcomingFixtures(config.sport, config.sport);

      for (const match of matches) {
        const existing = await prisma.pool.findFirst({
          where: { matchId: match.id, poolType: 'SPORTS' },
        });
        if (existing) continue;

        const hoursUntilKickoff = (match.kickoff.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilKickoff > POOL_OPEN_HOURS_BEFORE || hoursUntilKickoff < 0) continue;

        await createSportsPool(match, config.sport);
      }
    } catch (error) {
      console.error(`[Sports] Failed to create ${config.sport} pools:`, error);
    }
  }
}

/**
 * Check finished matches and resolve their pools.
 * Runs every 5 minutes. Does NOT rely on endTime — only checks the real match result from API.
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

  for (const pool of unresolved) {
    if (!pool.matchId) continue;

    try {
      const result = resultMap.get(pool.matchId);
      if (!result) {
        // Match not finished yet in cache - skip
        continue;
      }

      // Use the correct adapter based on pool league (Football vs Polymarket)
      const adapter = getAdapterForLeague(pool.league);
      const winnerSide = adapter.resolveWinner(result);
      const winnerLabel = (['UP', 'DOWN', 'DRAW'] as const)[winnerSide];

      // Resolve on-chain
      const connection = getConnection();
      const wallet = getAuthorityKeypair();
      const seed = derivePoolSeed(pool.id);
      const [poolPda] = getPoolPDA(seed);

      const ix = buildResolveWithWinnerIx(poolPda, wallet.publicKey, winnerSide as 0 | 1 | 2);
      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      tx.sign(wallet);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

      // Update DB — set RESOLVED first, processClaimableTransitions() will
      // move it to CLAIMABLE after 2s (same flow as crypto pools)
      await prisma.pool.update({
        where: { id: pool.id },
        data: {
          status: 'RESOLVED',
          winner: winnerLabel,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          finalPrice: BigInt(0), // Not applicable for sports
        },
      });

      emitPoolStatus(pool.id, { id: pool.id, status: 'RESOLVED', winner: winnerLabel });

      console.log(`[Sports] Resolved ${pool.homeTeam} vs ${pool.awayTeam}: ${result.homeScore}-${result.awayScore} → ${winnerLabel}`);
    } catch (error) {
      console.error(`[Sports] Failed to resolve pool ${pool.id}:`, error);
    }
  }
}

async function createSportsPool(match: Match, leagueCode: string): Promise<void> {
  const poolId = crypto.randomUUID();
  const asset = `${leagueCode}:${match.homeTeam}-${match.awayTeam}`.slice(0, 32);
  const adapter = getAdapterForLeague(leagueCode);
  const isPolymarket = leagueCode.startsWith('PM_');

  const kickoff = match.kickoff;
  const lockTime = isPolymarket
    ? new Date(kickoff.getTime() - 60 * 60 * 1000) // PM: lock 1h before endDate
    : new Date(kickoff.getTime() - 60 * 1000);      // Football: lock 1min before kickoff
  const startTime = kickoff;
  const endTime = isPolymarket
    ? new Date(kickoff.getTime() + 48 * 60 * 60 * 1000) // PM: +48h buffer for UMA resolution
    : new Date(kickoff.getTime() + 6 * 60 * 60 * 1000); // Football: +6h
  const durationSeconds = isPolymarket ? 48 * 60 * 60 : 6 * 60 * 60;
  const interval = isPolymarket ? 'prediction' : 'match';

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
        poolType: 'SPORTS',
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeTeamCrest: match.homeTeamCrest || null,
        awayTeamCrest: match.awayTeamCrest || null,
        league: leagueCode,
        marketOdds: cacheEntry?.marketOdds ?? null,
        clobTokenIds: cacheEntry?.clobTokenIds ?? null,
        matchAnalysis: cacheEntry?.groupItemTitle ?? null, // PM description/rules
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

    const tx = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet);

    try {
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    } catch (chainError) {
      // On-chain failed — roll back DB to prevent stale DB-only pool
      await prisma.pool.delete({ where: { id: poolId } }).catch(() => {});
      console.warn(`[Sports] On-chain creation failed, rolled back DB row ${poolId}`);
      throw chainError;
    }

    console.log(`[Sports] Created pool for ${match.homeTeam} vs ${match.awayTeam} (${leagueCode}, kickoff: ${kickoff.toISOString()})`);

    // Generate match analysis in background (non-blocking)
    if (!isPolymarket) {
      generateMatchAnalysis(match.id, match.homeTeam, match.awayTeam, leagueCode)
        .then(analysis => {
          if (analysis) {
            prisma.pool.update({ where: { id: poolId }, data: { matchAnalysis: analysis } })
              .then(() => console.log(`[Sports] Analysis saved for ${match.homeTeam} vs ${match.awayTeam}`))
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  } catch (error) {
    console.error(`[Sports] Failed to create pool for ${match.homeTeam} vs ${match.awayTeam}:`, error);
  }
}

/**
 * Start the sports scheduler with cron jobs.
 */
export function startSportsScheduler(): void {
  // Create match pools every 6 hours
  const createInterval = setInterval(async () => {
    try {
      await createMatchPools();
    } catch (error) {
      console.error('[Sports] Scheduler create error:', error);
    }
  }, 6 * 60 * 60 * 1000);

  // Resolve finished matches every 5 minutes
  const resolveInterval = setInterval(async () => {
    try {
      await resolveMatchPools();
    } catch (error) {
      console.error('[Sports] Scheduler resolve error:', error);
    }
  }, 5 * 60 * 1000);

  // Run once on startup
  createMatchPools().catch(e => console.error('[Sports] Initial create error:', e));

  console.log('[Sports] Scheduler started (create: 6h, resolve: 5m)');
}
