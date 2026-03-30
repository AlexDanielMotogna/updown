import { PoolStatus } from '@prisma/client';
import { PublicKey } from '@solana/web3.js';
import { emitPoolStatus } from '../websocket';
import { notifyPoolClaimable } from '../services/notifications';
import { derivePoolSeed, getConnection } from '../utils/solana';
import { getVaultPDA } from 'solana-client';
import { ResolverDeps, logEvent, handleRpcError } from './resolver-types';
import { resolvePool } from './resolve-logic';
import { closePoolOnChain } from './onchain-tx';
import {
  forceResolvePool as _forceResolvePool,
  forceRefundPool as _forceRefundPool,
  forceClosePool as _forceClosePool,
} from './admin-actions';
import { recoverOrphanedPools as _recoverOrphanedPools } from './orphan-recovery';

// Re-export for external consumers
export { ResolverDeps } from './resolver-types';

/**
 * Handles pool resolution: final price capture, winner determination,
 * on-chain resolve, and RESOLVED → CLAIMABLE transitions.
 *
 * Thin orchestrator — delegates to standalone functions in:
 *   resolve-logic.ts, onchain-tx.ts, admin-actions.ts, orphan-recovery.ts
 */
export class PoolResolver {
  /** Track close_pool failures to avoid retrying every 2s */
  private closeFailures = new Map<string, number>();
  private static CLOSE_RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes
  /** Prevent concurrent processPoolClosures executions */
  private closingInProgress = false;

  constructor(private deps: ResolverDeps) {}

  /**
   * Find and resolve all JOINING/ACTIVE pools past their endTime.
   */
  async processResolutions(): Promise<void> {
    const bufferMs = 5000;
    const cutoff = new Date(Date.now() - bufferMs);
    const poolsToResolve = await this.deps.prisma.pool.findMany({
      where: {
        status: { in: [PoolStatus.JOINING, PoolStatus.ACTIVE] },
        endTime: { lte: cutoff },
      },
    });

    await Promise.all(
      poolsToResolve.map((pool) => resolvePool(this.deps, pool))
    );
  }

  /**
   * Transition RESOLVED pools to CLAIMABLE after a short delay.
   */
  async processClaimableTransitions(): Promise<void> {
    const twoSecondsAgo = new Date(Date.now() - 2000);
    const staleResolved = await this.deps.prisma.pool.findMany({
      where: {
        status: PoolStatus.RESOLVED,
        updatedAt: { lte: twoSecondsAgo },
      },
      select: { id: true, asset: true, poolType: true, winner: true, homeTeam: true, awayTeam: true },
    });

    for (const pool of staleResolved) {
      await this.deps.prisma.pool.update({
        where: { id: pool.id },
        data: { status: PoolStatus.CLAIMABLE },
      });
      emitPoolStatus(pool.id, { id: pool.id, status: 'CLAIMABLE' });
      notifyPoolClaimable(pool).catch(() => {});
      console.log(`[Scheduler] Pool ${pool.id} → CLAIMABLE`);
    }
  }

  /**
   * Delete resolved/claimable pools that had zero participants.
   */
  async cleanupEmptyPools(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    try {
      const emptyPools = await this.deps.prisma.pool.findMany({
        where: {
          status: PoolStatus.CLAIMABLE,
          totalUp: BigInt(0),
          totalDown: BigInt(0),
          endTime: { lt: oneHourAgo },
        },
        select: { id: true, poolId: true },
      });

      if (emptyPools.length === 0) return 0;

      // Verify pools don't exist on-chain before deleting (prevents orphans)
      const connection = getConnection();
      const safeIds: string[] = [];
      const CHUNK_SIZE = 100;

      for (let i = 0; i < emptyPools.length; i += CHUNK_SIZE) {
        const chunk = emptyPools.slice(i, i + CHUNK_SIZE);
        const pdas = chunk.map(p => new PublicKey(p.poolId));
        try {
          const accountInfos = await connection.getMultipleAccountsInfo(pdas);
          for (let j = 0; j < accountInfos.length; j++) {
            if (accountInfos[j] === null) {
              safeIds.push(chunk[j].id); // Not on-chain — safe to delete
            }
          }
        } catch {
          // RPC error — skip this chunk to be safe
          console.warn(`[Scheduler] RPC error checking on-chain pools, skipping chunk of ${chunk.length}`);
        }
      }

      const skippedCount = emptyPools.length - safeIds.length;
      if (skippedCount > 0) {
        console.warn(`[Scheduler] ${skippedCount} empty pool(s) still on-chain — skipping DB deletion`);
      }

      if (safeIds.length === 0) return 0;

      await this.deps.prisma.priceSnapshot.deleteMany({ where: { poolId: { in: safeIds } } });
      await this.deps.prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: { in: safeIds } } });
      await this.deps.prisma.pool.deleteMany({ where: { id: { in: safeIds } } });

      await logEvent(this.deps.prisma, 'POOLS_CLEANUP', 'system', 'scheduler', {
        deletedCount: safeIds.length.toString(),
        poolIds: JSON.stringify(safeIds),
        skippedOnChain: skippedCount.toString(),
      });

      console.log(`[Scheduler] Cleaned up ${safeIds.length} empty pool(s)${skippedCount > 0 ? ` (${skippedCount} skipped — still on-chain)` : ''}`);
      return safeIds.length;
    } catch (error) {
      console.error('[Scheduler] Failed to cleanup empty pools:', error);
      return 0;
    }
  }

  /**
   * Close resolved pools whose vaults are empty (all claims/refunds done).
   */
  async processPoolClosures(): Promise<void> {
    if (this.closingInProgress) return;
    this.closingInProgress = true;

    try {
      const cutoff = new Date(Date.now() - 30_000);
      const candidates = await this.deps.prisma.pool.findMany({
        where: {
          status: PoolStatus.CLAIMABLE,
          updatedAt: { lte: cutoff },
        },
        select: { id: true, poolId: true },
      });

      const connection = getConnection();

      for (const pool of candidates) {
        const lastFailure = this.closeFailures.get(pool.id);
        if (lastFailure && Date.now() - lastFailure < PoolResolver.CLOSE_RETRY_DELAY_MS) continue;

        const unclaimed = await this.deps.prisma.bet.count({
          where: { poolId: pool.id, claimed: false },
        });
        if (unclaimed > 0) continue;

        const poolData = await this.deps.prisma.pool.findUnique({ where: { id: pool.id } });
        const betCount = await this.deps.prisma.bet.count({ where: { poolId: pool.id } });

        try {
          // Verify vault is actually empty on-chain before closing
          const closeSeed = derivePoolSeed(pool.id);
          const [closureVaultPda] = getVaultPDA(closeSeed);
          try {
            const vaultBalance = await connection.getTokenAccountBalance(closureVaultPda);
            const vaultAmount = Number(vaultBalance.value.amount);
            if (vaultAmount > 0) {
              console.warn(`[Scheduler] Pool ${pool.id} vault still has ${vaultAmount} tokens — skipping close`);
              continue;
            }
          } catch {
            // Vault account might not exist (already closed) — that's fine, proceed
          }

          const balanceBefore = await connection.getBalance(this.deps.wallet.publicKey);
          const txSig = await closePoolOnChain(this.deps, pool.id);
          const balanceAfter = await connection.getBalance(this.deps.wallet.publicKey);
          const rentReclaimed = balanceAfter - balanceBefore;

          await logEvent(this.deps.prisma, 'POOL_CLOSED', 'closure', pool.id, {
            poolId: pool.id,
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
          });

          this.closeFailures.delete(pool.id);
          await this.deps.prisma.priceSnapshot.deleteMany({ where: { poolId: pool.id } });
          if (betCount === 0) {
            // No participants — safe to delete entirely
            await this.deps.prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: pool.id } });
            await this.deps.prisma.pool.deleteMany({ where: { id: pool.id } });
            console.log(`[Scheduler] Pool ${pool.id} closed on-chain & deleted (empty, rent: +${(rentReclaimed / 1e9).toFixed(6)} SOL)`);
          } else {
            // Had participants — keep pool + bets for history, mark RESOLVED so it's not retried
            await this.deps.prisma.pool.update({ where: { id: pool.id }, data: { status: 'RESOLVED' } });
            console.log(`[Scheduler] Pool ${pool.id} closed on-chain (${betCount} bets kept, marked RESOLVED, rent: +${(rentReclaimed / 1e9).toFixed(6)} SOL)`);
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);

          if (errMsg.includes('AccountNotInitialized') || errMsg.includes('Custom":3012')) {
            console.log(`[Scheduler] Pool ${pool.id} already closed on-chain — cleaning up DB records`);
            await logEvent(this.deps.prisma, 'POOL_CLOSED', 'closure', pool.id, {
              poolId: pool.id,
              asset: poolData?.asset ?? 'unknown',
              interval: poolData?.interval ?? 'unknown',
              betCount: betCount.toString(),
              source: 'auto_cleanup',
              note: 'Pool PDA already closed on-chain',
            });
            this.closeFailures.delete(pool.id);
            await this.deps.prisma.priceSnapshot.deleteMany({ where: { poolId: pool.id } });
            if (betCount === 0) {
              await this.deps.prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: pool.id } });
              await this.deps.prisma.pool.deleteMany({ where: { id: pool.id } });
              console.log(`[Scheduler] Pool ${pool.id} already closed — deleted (empty)`);
            } else {
              // Mark as RESOLVED so it won't be picked up for closure again
              await this.deps.prisma.pool.update({ where: { id: pool.id }, data: { status: 'RESOLVED' } });
              console.log(`[Scheduler] Pool ${pool.id} already closed — kept (${betCount} bets, marked RESOLVED)`);
            }
            continue;
          }

          this.closeFailures.set(pool.id, Date.now());
          console.warn(
            `[Scheduler] Failed to close pool ${pool.id} (will retry in 5m):`,
            errMsg,
          );
        }
      }
    } catch (error) {
      handleRpcError(error);
      console.error('[Scheduler] processPoolClosures error:', error);
    } finally {
      this.closingInProgress = false;
    }
  }

  // --- Admin actions (delegated to standalone functions) ---

  async forceResolvePool(pool: {
    id: string;
    poolId: string;
    asset: string;
    strikePrice: bigint | null;
    totalUp: bigint;
    totalDown: bigint;
  }): Promise<void> {
    await _forceResolvePool(this.deps, pool);
  }

  async forceRefundPool(poolId: string): Promise<void> {
    await _forceRefundPool(this.deps, poolId);
  }

  async forceClosePool(poolId: string): Promise<void> {
    await _forceClosePool(this.deps, poolId);
  }

  async recoverOrphanedPools(
    onProgress?: (event: { type: string; message: string; [key: string]: unknown }) => void,
    shouldAbort?: () => boolean,
  ): Promise<{
    totalOnChain: number;
    totalInDb: number;
    orphaned: number;
    closed: number;
    skipped: number;
    failed: number;
    totalRentReclaimed: string;
  }> {
    return _recoverOrphanedPools(this.deps, onProgress, shouldAbort);
  }
}
