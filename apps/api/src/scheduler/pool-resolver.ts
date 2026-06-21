import { PoolStatus } from '@prisma/client';
import { PublicKey } from '@solana/web3.js';
import { emitPoolStatus } from '../websocket';
import { notifyPoolClaimable } from '../services/notifications';
import { derivePoolSeed, getConnection } from '../utils/solana';
import { getVaultPDA } from 'solana-client';
import { ResolverDeps, logEvent, handleRpcError } from './resolver-types';
import { resolvePool } from './resolve-logic';
import { closePoolOnChain, resolvePoolOnChain, closeLosingBetOnChain, sweepVaultDustOnChain } from './onchain-tx';
import { autoClaimBets } from './auto-claim';
import { autoPayoutEnabledFor } from '../utils/auto-payout-flag';
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
 * Thin orchestrator - delegates to standalone functions in:
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
    // Sports pools have their own resolver in sports-scheduler.ts (driven by
    // the actual match result, not endTime). They land in this scheduler only
    // by accident - and the crypto-style price-based resolution does the
    // wrong thing for them (strikePrice on sports is 0n, which is falsy and
    // sends them down handleNoStrikePricePool incorrectly).
    const poolsToResolve = await this.deps.prisma.pool.findMany({
      where: {
        status: { in: [PoolStatus.JOINING, PoolStatus.ACTIVE] },
        endTime: { lte: cutoff },
        poolType: 'CRYPTO',
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
        // closedAt acts as a terminal flag — once the on-chain PDA is gone
        // we stop revolving the pool through RESOLVED→CLAIMABLE again, which
        // is what caused the POOL_CLOSED auto_cleanup loop (every successful
        // close used to mark RESOLVED, this branch immediately re-flipped it
        // to CLAIMABLE, and processPoolClosures retried close every ~30s).
        closedAt: null,
      },
      select: { id: true, asset: true, poolType: true, winner: true, homeTeam: true, awayTeam: true, league: true },
    });

    for (const pool of staleResolved) {
      await this.deps.prisma.pool.update({
        where: { id: pool.id },
        data: { status: PoolStatus.CLAIMABLE },
      });
      emitPoolStatus(pool.id, { id: pool.id, status: 'CLAIMABLE' });
      console.log(`[Scheduler] Pool ${pool.id} → CLAIMABLE`);

      // Decide between auto-payout and the legacy "Claim Available" toast
      // on a per-pool basis. When the feature flag is on for this pool's
      // category, the scheduler does the work; otherwise the user gets the
      // legacy notification and reclaims manually.
      const autoEnabled = await autoPayoutEnabledFor(pool);
      if (autoEnabled) {
        // Fire-and-forget - autoClaimBets handles its own retries, logging,
        // and per-bet failure paths. We don't await so the tick doesn't
        // block on RPC for pools with many winners.
        autoClaimBets(this.deps, pool).catch(err => {
          console.error(`[Scheduler] autoClaimBets crashed for pool ${pool.id}:`, err);
        });
      } else {
        notifyPoolClaimable(pool).catch(() => {});
      }
    }
  }

  /**
   * Retry auto-payout for CLAIMABLE pools whose winners were never paid.
   *
   * The one-shot auto-payout fired at the RESOLVED→CLAIMABLE transition can
   * fail wholesale during an RPC outage (429 storm) or a process crash,
   * orphaning every winner in CLAIMABLE forever (there was no retry). This
   * sweep re-runs autoClaimBets on a small batch of such pools each tick so
   * the backlog drains and never accumulates again. Batch-limited to keep RPC
   * pressure sane; autoClaimBets is idempotent (optimistic-locked per bet).
   */
  async retryUnpaidClaimable(): Promise<void> {
    const pools = await this.deps.prisma.pool.findMany({
      where: {
        status: PoolStatus.CLAIMABLE,
        closedAt: null,
        winner: { not: null },
        bets: { some: { claimed: false, payoutFailed: false } },
      },
      select: { id: true, asset: true, poolType: true, winner: true, homeTeam: true, awayTeam: true, league: true },
      orderBy: { updatedAt: 'asc' }, // oldest backlog first
      take: 8,
    });
    for (const pool of pools) {
      if (!(await autoPayoutEnabledFor(pool))) continue;
      await autoClaimBets(this.deps, pool).catch(err => {
        console.error(`[Scheduler] retryUnpaidClaimable autoClaimBets crashed for pool ${pool.id}:`, err);
      });
    }
  }

  /**
   * Return the rent of LOSING bets back to their bettors by closing their
   * on-chain user_bet accounts. Losers forfeit only their USDC stake, not the
   * ~0.0009 SOL rent. Gated behind CLOSE_LOSING_BETS=on because it needs the
   * `close_losing_bet` program instruction deployed; until then it's a no-op.
   * Batch-limited + throttled to keep RPC pressure sane.
   */
  async closeLosingBets(): Promise<void> {
    if (process.env.CLOSE_LOSING_BETS !== 'on') return;
    const sides = ['UP', 'DOWN', 'DRAW'] as const;
    for (const side of sides) {
      const others = sides.filter(s => s !== side);
      const losers = await this.deps.prisma.bet.findMany({
        where: {
          side,
          claimed: false,
          payoutFailed: false,
          pool: { status: PoolStatus.CLAIMABLE, closedAt: null, winner: { in: [...others] } },
        },
        select: { id: true, poolId: true, walletAddress: true, side: true },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      for (const bet of losers) {
        try {
          const sig = await closeLosingBetOnChain(this.deps, bet.poolId, bet.walletAddress, bet.side);
          await this.deps.prisma.bet.updateMany({
            where: { id: bet.id, claimed: false },
            data: { claimed: true, claimTx: sig },
          });
          console.log(`[Scheduler] closed losing bet ${bet.id} — rent returned to ${bet.walletAddress.slice(0, 6)}`);
        } catch (e) {
          handleRpcError(e);
          const msg = e instanceof Error ? e.message : String(e);
          // Pool (or user_bet) account gone = the pool was already closed before
          // we reached this loser. The rent can no longer be reclaimed on-chain;
          // mark it settled so we stop retrying it every cycle.
          if (msg.includes('AccountNotInitialized') || msg.includes('0xbc4') || msg.includes('Error Number: 3012')) {
            await this.deps.prisma.bet.updateMany({ where: { id: bet.id, claimed: false }, data: { claimed: true } }).catch(() => {});
            console.warn(`[Scheduler] losing bet ${bet.id}: pool already closed — rent unrecoverable, marking settled`);
          } else {
            console.warn(`[Scheduler] close losing bet ${bet.id} failed:`, msg);
          }
        }
        await new Promise(r => setTimeout(r, 400));
      }
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
              safeIds.push(chunk[j].id); // Not on-chain - safe to delete
            }
          }
        } catch {
          // RPC error - skip this chunk to be safe
          console.warn(`[Scheduler] RPC error checking on-chain pools, skipping chunk of ${chunk.length}`);
        }
      }

      const skippedCount = emptyPools.length - safeIds.length;
      if (skippedCount > 0) {
        console.warn(`[Scheduler] ${skippedCount} empty pool(s) still on-chain - skipping DB deletion`);
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

      console.log(`[Scheduler] Cleaned up ${safeIds.length} empty pool(s)${skippedCount > 0 ? ` (${skippedCount} skipped - still on-chain)` : ''}`);
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
          // Already-closed pools never re-enter the close loop. Without this
          // any pool whose users all claimed (vault empty, PDA reclaimed)
          // would cycle here forever via processClaimableTransitions.
          closedAt: null,
          // Only fetch CLOSEABLE pools. A pool with unclaimed bets still has
          // funds in its vault (winner payouts pending), so close_pool reverts
          // VaultNotEmpty — it can't be closed yet. Those are the OLDEST
          // CLAIMABLE rows (stuck longest), so under the previous oldest-first
          // `take` they permanently filled the batch and starved the thousands
          // of empty pools behind them → nothing closed → on-chain pools + rent
          // leaked indefinitely. Excluding them keeps the batch full of pools
          // that can actually close; each re-enters automatically once its
          // winners are paid/claimed (no unclaimed bets remain). The per-pool
          // safety checks below still gate the real close.
          bets: { none: { claimed: false } },
        },
        select: { id: true, poolId: true, winner: true },
        orderBy: { updatedAt: 'asc' }, // oldest backlog first
        take: 50, // batch per run (RPC has headroom now); the closeable-only
                  // filter above means these are all real close candidates
      });

      const connection = getConnection();

      for (const pool of candidates) {
        const lastFailure = this.closeFailures.get(pool.id);
        if (lastFailure && Date.now() - lastFailure < PoolResolver.CLOSE_RETRY_DELAY_MS) continue;

        // Only WINNING-side bets still owed a payout should block closing.
        // Losing bets are never claimed (nothing to claim), so counting all
        // unclaimed bets kept every 2-sided pool open forever. The on-chain
        // vault-empty check below remains the real safety gate.
        // When loser-rent recovery is ON, require ALL bets settled (winners paid
        // AND losers closed by closeLosingBets) before closing — otherwise the
        // pool PDA gets removed before a loser's rent can be returned, orphaning
        // it (close_losing_bet then fails with pool AccountNotInitialized). When
        // OFF, only unpaid winners block (losers never claim).
        const cleanupOn = process.env.CLOSE_LOSING_BETS === 'on';
        const blocking = cleanupOn
          ? await this.deps.prisma.bet.count({ where: { poolId: pool.id, claimed: false, payoutFailed: false } })
          : pool.winner
            ? await this.deps.prisma.bet.count({ where: { poolId: pool.id, side: pool.winner as 'UP' | 'DOWN' | 'DRAW', claimed: false, payoutFailed: false } })
            : await this.deps.prisma.bet.count({ where: { poolId: pool.id, claimed: false } });
        if (blocking > 0) continue;

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
              // Time-weighted payouts (deployed 2026-06-05) leave a few micro-USDC
              // of rounding dust in the vault, so it never reaches 0 and close_pool
              // (needs amount==0) reverts — the pool can never close and its ~0.004
              // SOL rent is stranded forever. `sweep_vault_dust` is deployed, so
              // always sweep tiny dust (<= 1000 = 0.001 USDC) and fall through to
              // close. This is decoupled from CLOSE_LOSING_BETS on purpose: dust-
              // blocked closes were the main on-chain pool/rent leak (~half of the
              // CLAIMABLE backlog had 1 micro-USDC vaults), and dust-sweeping is
              // independently safe — real funds (> dust) always back off so pending
              // winners are never swept. If the instruction somehow isn't deployed,
              // the call reverts and we fall into the same retry-backoff as before.
              if (vaultAmount <= 1000) {
                try {
                  await sweepVaultDustOnChain(this.deps, pool.id);
                  // vault is now 0 — fall through to close below
                } catch (e) {
                  handleRpcError(e);
                  console.warn(`[Scheduler] dust sweep failed for ${pool.id}:`, e instanceof Error ? e.message : e);
                  this.closeFailures.set(pool.id, Date.now());
                  continue;
                }
              } else {
                console.warn(`[Scheduler] Pool ${pool.id} vault still has ${vaultAmount} tokens - skipping close`);
                this.closeFailures.set(pool.id, Date.now());
                continue;
              }
            }
          } catch {
            // Vault account might not exist (already closed) - that's fine, proceed
          }

          // Note: we used to read getBalance before+after just to log the rent
          // reclaimed — two extra RPC calls per close, every tick. Dropped to cut
          // RPC cost; close_pool returns the pool PDA's rent to the authority
          // (a fixed ~0.004 SOL), which isn't worth two balance reads to log.
          const txSig = await closePoolOnChain(this.deps, pool.id);

          await logEvent(this.deps.prisma, 'POOL_CLOSED', 'closure', pool.id, {
            poolId: pool.id,
            asset: poolData?.asset ?? 'unknown',
            interval: poolData?.interval ?? 'unknown',
            totalUp: poolData?.totalUp?.toString() ?? '0',
            totalDown: poolData?.totalDown?.toString() ?? '0',
            totalPool: ((poolData?.totalUp ?? BigInt(0)) + (poolData?.totalDown ?? BigInt(0))).toString(),
            betCount: betCount.toString(),
            winner: poolData?.winner ?? 'none',
            txSignature: txSig,
          });

          this.closeFailures.delete(pool.id);
          await this.deps.prisma.priceSnapshot.deleteMany({ where: { poolId: pool.id } });
          if (betCount === 0) {
            // No participants - safe to delete entirely
            await this.deps.prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: pool.id } });
            await this.deps.prisma.pool.deleteMany({ where: { id: pool.id } });
            console.log(`[Scheduler] Pool ${pool.id} closed on-chain & deleted (empty)`);
          } else {
            // Had participants - keep pool + bets for history. We leave the
            // status at CLAIMABLE so the UI keeps showing the result, and
            // stamp closedAt so neither processClaimableTransitions nor
            // processPoolClosures will look at this row again.
            await this.deps.prisma.pool.update({ where: { id: pool.id }, data: { closedAt: new Date() } });
            console.log(`[Scheduler] Pool ${pool.id} closed on-chain (${betCount} bets kept, closedAt stamped)`);
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);

          if (errMsg.includes('InvalidPoolStatus') || errMsg.includes('0x177a')) {
            // Pool not resolved on-chain (resolve failed due to 429/timeout) - resolve then retry close
            console.log(`[Scheduler] Pool ${pool.id} not resolved on-chain - resolving before close`);
            try {
              const strike = poolData?.strikePrice ?? BigInt(1000);
              const final = poolData?.finalPrice ?? strike;
              await resolvePoolOnChain(this.deps, pool.id, strike, final);
              // Retry close immediately
              const txSig2 = await closePoolOnChain(this.deps, pool.id);
              this.closeFailures.delete(pool.id);
              await this.deps.prisma.priceSnapshot.deleteMany({ where: { poolId: pool.id } });
              if (betCount === 0) {
                await this.deps.prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: pool.id } });
                await this.deps.prisma.pool.deleteMany({ where: { id: pool.id } });
                console.log(`[Scheduler] Pool ${pool.id} resolved + closed on-chain & deleted (empty)`);
              } else {
                // Same as the happy path above — stamp closedAt and keep the
                // row at CLAIMABLE so users still see the result and the
                // resolver pipeline ignores the row from here on.
                await this.deps.prisma.pool.update({ where: { id: pool.id }, data: { closedAt: new Date() } });
                console.log(`[Scheduler] Pool ${pool.id} resolved + closed on-chain (${betCount} bets kept, closedAt stamped)`);
              }
            } catch (resolveErr) {
              this.closeFailures.set(pool.id, Date.now());
              console.warn(`[Scheduler] Pool ${pool.id} resolve+close failed (will retry in 5m):`, resolveErr instanceof Error ? resolveErr.message : resolveErr);
            }
            continue;
          }

          if (errMsg.includes('AccountNotInitialized') || errMsg.includes('Custom":3012')) {
            // The on-chain PDA is gone — either we closed it earlier (and the
            // row got resurrected by processClaimableTransitions, pre-closedAt
            // fix) or it was closed out-of-band. Stamp closedAt so we never
            // come back here for this pool. Previously this branch marked the
            // row RESOLVED, which the transition job immediately flipped back
            // to CLAIMABLE, producing one POOL_CLOSED auto_cleanup log every
            // ~30s indefinitely (5k+ events seen on a single pool).
            console.log(`[Scheduler] Pool ${pool.id} already closed on-chain - stamping closedAt`);
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
              console.log(`[Scheduler] Pool ${pool.id} already closed - deleted (empty)`);
            } else {
              await this.deps.prisma.pool.update({ where: { id: pool.id }, data: { closedAt: new Date() } });
              console.log(`[Scheduler] Pool ${pool.id} already closed - kept (${betCount} bets, closedAt stamped)`);
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
    endTime: Date;
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
