import { PoolStatus, Side } from '@prisma/client';
import { ResolverDeps, logEvent } from './resolver-types';
import { resolvePool, pricesForSideWin } from './resolve-logic';
import { resolvePoolOnChain, closePoolOnChain, autoRefundBets } from './onchain-tx';
import { getConnection } from '../utils/solana';

/**
 * Force-resolve a pool from admin panel. Reuses existing resolvePool logic.
 */
export async function forceResolvePool(
  deps: ResolverDeps,
  pool: {
    id: string;
    poolId: string;
    asset: string;
    strikePrice: bigint | null;
    totalUp: bigint;
    totalDown: bigint;
    endTime: Date;
  },
): Promise<void> {
  await resolvePool(deps, pool);
}

/**
 * Force-refund all bets in a pool from admin panel.
 * Resolves on-chain with synthetic prices if needed, then auto-refunds all bets.
 */
export async function forceRefundPool(
  deps: ResolverDeps,
  poolId: string,
): Promise<void> {
  const pool = await deps.prisma.pool.findUnique({ where: { id: poolId } });
  if (!pool) throw new Error('Pool not found');

  // GUARD: the on-chain `refund` instruction is WINNER-TAKE-ALL — it resolves
  // the pool with a synthetic winner and pays that side its stake + the losing
  // side's stake. On a pool with bets on MORE THAN ONE side that is destructive
  // (the tie-break winner robs the other side; the loser can never be refunded
  // because `require!(user_bet.side == winner)` reverts). Refuse it. A fair
  // per-bettor refund needs a new on-chain instruction. For a multi-sided stuck
  // pool, resolve it with the REAL winner instead.
  const sidesFunded = [pool.totalUp, pool.totalDown, pool.totalDraw ?? 0n].filter(v => v > 0n).length;
  if (sidesFunded > 1) {
    throw new Error(
      `Force-refund refused for pool ${poolId}: bets exist on ${sidesFunded} sides and the on-chain refund is winner-take-all (would pay one side the others' funds and leave losers unrefundable). Resolve with the real winner instead, or wait for the per-bettor refund instruction.`,
    );
  }

  const bets = await deps.prisma.bet.findMany({
    where: { poolId, claimed: false },
  });

  if (bets.length === 0) {
    // No unclaimed bets - just move to CLAIMABLE
    await deps.prisma.pool.update({
      where: { id: poolId },
      data: { status: PoolStatus.CLAIMABLE },
    });
    return;
  }

  // If pool is still JOINING/ACTIVE, resolve on-chain first with synthetic prices
  if (pool.status === PoolStatus.JOINING || pool.status === PoolStatus.ACTIVE) {
    // Determine which side has more bets and make that side win
    const hasUp = bets.some(b => b.side === 'UP');
    const hasDown = bets.some(b => b.side === 'DOWN');
    let refundWinner: 'UP' | 'DOWN';
    if (hasUp && !hasDown) refundWinner = 'UP';
    else if (hasDown && !hasUp) refundWinner = 'DOWN';
    else refundWinner = 'DOWN'; // tie → DOWN

    const { onChainStrike, onChainFinal } = pricesForSideWin(refundWinner as unknown as Side);

    // Claim status atomically
    await deps.prisma.pool.updateMany({
      where: { id: poolId, status: { in: [PoolStatus.JOINING, PoolStatus.ACTIVE] } },
      data: { status: PoolStatus.RESOLVED },
    });

    await resolvePoolOnChain(deps, poolId, onChainStrike, onChainFinal);

    await deps.prisma.pool.update({
      where: { id: poolId },
      data: { status: PoolStatus.CLAIMABLE, winner: refundWinner as unknown as Side },
    });
  }

  // Auto-refund all unclaimed bets
  await autoRefundBets(deps, poolId, bets);
}

/**
 * Force-close a pool from admin panel.
 * Calls close_pool on-chain and cleans up DB records.
 */
export async function forceClosePool(
  deps: ResolverDeps,
  poolId: string,
): Promise<void> {
  const connection = getConnection();

  // Snapshot pool data before closing
  const poolData = await deps.prisma.pool.findUnique({ where: { id: poolId } });
  const betCount = await deps.prisma.bet.count({ where: { poolId } });

  // Measure rent reclaimed
  const balanceBefore = await connection.getBalance(deps.wallet.publicKey);
  const txSig = await closePoolOnChain(deps, poolId);
  const balanceAfter = await connection.getBalance(deps.wallet.publicKey);
  const rentReclaimed = balanceAfter - balanceBefore;

  // Log closure event BEFORE deleting records
  await logEvent(deps.prisma, 'POOL_CLOSED', 'closure', poolId, {
    poolId,
    asset: poolData?.asset ?? 'unknown',
    interval: poolData?.interval ?? 'unknown',
    totalUp: poolData?.totalUp?.toString() ?? '0',
    totalDown: poolData?.totalDown?.toString() ?? '0',
    totalPool: ((poolData?.totalUp ?? BigInt(0)) + (poolData?.totalDown ?? BigInt(0))).toString(),
    betCount: betCount.toString(),
    winner: poolData?.winner ?? 'none',
    rentReclaimedLamports: rentReclaimed.toString(),
    rentReclaimedSol: (rentReclaimed / 1e9).toFixed(6),
    txSignature: txSig,
    source: 'admin',
  });

  // Clean up DB records
  await deps.prisma.priceSnapshot.deleteMany({ where: { poolId } });
  await deps.prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: poolId } });
  await deps.prisma.bet.deleteMany({ where: { poolId } });
  await deps.prisma.pool.deleteMany({ where: { id: poolId } });
}
