import { prisma } from '../db';
import type { MatchResult } from '../services/sports/types';
import { notifyPoolResolved } from '../services/notifications';
import { getCachedFixtureResults } from '../services/sports/fixture-cache';
import { getPoolPDA, buildResolveWithWinnerIx } from 'solana-client';
import { derivePoolSeed, getAuthorityKeypair } from '../utils/solana';
import { sendAndConfirm } from '../utils/onchain';
import { emitPoolStatus } from '../websocket';
import { awardBetResolution } from '../services/rewards';
import { getAdapterForLeague, type SportsPool } from './sports-shared';
import { voidSportsPool } from './sports-pool-void';

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

  // Always update scores immediately so the UI shows the final result
  await prisma.pool.update({
    where: { id: pool.id },
    data: { homeScore: result.homeScore, awayScore: result.awayScore },
  });

  // A draw/tie (winnerSide 2) on a pool that has no draw side (numSides < 3 —
  // e.g. NBA/NHL/MMA/NFL, which are 2-side Home/Away) cannot be represented
  // on-chain: resolve_with_winner(2) fails with InvalidSide (6017) and the pool
  // retries forever. There's no valid winner, so VOID + refund instead — every
  // bettor gets their stake back; empty pools just close to reclaim rent.
  if (winnerSide >= pool.numSides) {
    console.warn(`[Sports] ${pool.id} (${pool.league}) ended in a draw/tie but the pool has only ${pool.numSides} sides — voiding + refunding`);
    await voidSportsPool(pool, 'draw-on-2-side-pool');
    return;
  }

  const winnerLabel = (['UP', 'DOWN', 'DRAW'] as const)[winnerSide];

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
