import { prisma } from '../db';
import { getAdapter } from '../services/sports';
import type { Match } from '../services/sports/types';
import { getPoolPDA, getVaultPDA, buildInitializePoolIx, buildResolveWithWinnerIx } from 'solana-client';
import { derivePoolSeed, getUsdcMint, getConnection, getAuthorityKeypair } from '../utils/solana';
import { Transaction } from '@solana/web3.js';
import crypto from 'crypto';
import { emitPoolStatus } from '../websocket';
import { generateMatchAnalysis } from '../services/sports/match-analysis';

const LEAGUES = ['CL', 'PL', 'PD', 'SA', 'BL1', 'FL1']; // UCL, Premier, La Liga, Serie A, Bundesliga, Ligue 1
const POOL_OPEN_HOURS_BEFORE = 720; // Open pool 30 days before kickoff

/**
 * Create pools for upcoming matches that don't have pools yet.
 * Runs every 6 hours.
 */
export async function createMatchPools(): Promise<void> {
  for (const leagueCode of LEAGUES) {
    try {
      const adapter = getAdapter('FOOTBALL');
      const matches = await adapter.fetchUpcomingMatches(leagueCode);

      for (const match of matches) {
        // Skip if pool already exists for this match
        const existing = await prisma.pool.findFirst({
          where: { matchId: match.id, poolType: 'SPORTS' },
        });
        if (existing) continue;

        // Skip if kickoff is more than POOL_OPEN_HOURS_BEFORE away
        const hoursUntilKickoff = (match.kickoff.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilKickoff > POOL_OPEN_HOURS_BEFORE || hoursUntilKickoff < 0) continue;

        await createSportsPool(match, leagueCode);
      }
    } catch (error) {
      console.error(`[Sports] Failed to fetch matches for ${leagueCode}:`, error);
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

  const adapter = getAdapter('FOOTBALL');

  for (const pool of unresolved) {
    if (!pool.matchId) continue;

    try {
      const result = await adapter.fetchMatchResult(pool.matchId);
      if (!result) {
        // Match not finished yet - skip
        continue;
      }

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

      // Update DB
      await prisma.pool.update({
        where: { id: pool.id },
        data: {
          status: 'CLAIMABLE',
          winner: winnerLabel,
          finalPrice: BigInt(0), // Not applicable for sports
        },
      });

      emitPoolStatus(pool.id, { id: pool.id, status: 'CLAIMABLE' });

      console.log(`[Sports] Resolved ${pool.homeTeam} vs ${pool.awayTeam}: ${result.homeScore}-${result.awayScore} → ${winnerLabel}`);
    } catch (error) {
      console.error(`[Sports] Failed to resolve pool ${pool.id}:`, error);
    }
  }
}

async function createSportsPool(match: Match, leagueCode: string): Promise<void> {
  const poolId = crypto.randomUUID();
  const asset = `${leagueCode}:${match.homeTeam}-${match.awayTeam}`.slice(0, 32);

  const kickoff = match.kickoff;
  const lockTime = new Date(kickoff.getTime() - 60 * 1000); // Lock 1 min before kickoff
  const startTime = kickoff;
  // endTime is set far ahead — resolution is driven by actual match result, not a timer
  const endTime = new Date(kickoff.getTime() + 6 * 60 * 60 * 1000); // kickoff + 6h (generous buffer for on-chain constraint)

  try {
    // Create on-chain
    const connection = getConnection();
    const wallet = getAuthorityKeypair();
    const seed = derivePoolSeed(poolId);
    const [poolPda] = getPoolPDA(seed);
    const [vaultPda] = getVaultPDA(seed);
    const usdcMint = getUsdcMint();

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
      BigInt(0), // No strike price for sports
      3,         // 3-way: Home, Away, Draw
    );

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

    // Create in DB
    await prisma.pool.create({
      data: {
        id: poolId,
        poolId: poolPda.toBase58(),
        asset,
        interval: 'match',
        durationSeconds: 6 * 60 * 60, // Not used for resolution — match result drives it
        status: 'JOINING',
        startTime,
        endTime,
        lockTime,
        strikePrice: BigInt(0),
        totalUp: BigInt(0),
        totalDown: BigInt(0),
        totalDraw: BigInt(0),
        numSides: 3,
        poolType: 'SPORTS',
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeTeamCrest: match.homeTeamCrest || null,
        awayTeamCrest: match.awayTeamCrest || null,
        league: leagueCode,
      },
    });

    console.log(`[Sports] Created pool for ${match.homeTeam} vs ${match.awayTeam} (${leagueCode}, kickoff: ${kickoff.toISOString()})`);

    // Generate match analysis in background (non-blocking)
    generateMatchAnalysis(match.id, match.homeTeam, match.awayTeam)
      .then(analysis => {
        if (analysis) {
          prisma.pool.update({ where: { id: poolId }, data: { matchAnalysis: analysis } })
            .then(() => console.log(`[Sports] Analysis saved for ${match.homeTeam} vs ${match.awayTeam}`))
            .catch(() => {});
        }
      })
      .catch(() => {});
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
