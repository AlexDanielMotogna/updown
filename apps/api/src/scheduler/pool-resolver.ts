import { PrismaClient, PoolStatus, Side, Prisma } from '@prisma/client';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { PacificaProvider } from 'market-data';
import { PROGRAM_ID, getPoolPDA, getVaultPDA, getUserBetPDA, buildResolveIx, buildRefundIx, buildClosePoolIx } from 'solana-client';
import { emitPoolStatus, emitRefund } from '../websocket';
import { resetStreak } from '../services/rewards';
import { derivePoolSeed, getUsdcMint } from '../utils/solana';

export interface ResolverDeps {
  prisma: PrismaClient;
  connection: Connection;
  wallet: Keypair;
  priceProvider: PacificaProvider;
}

const REFUND_MAX_RETRIES = 3;

/**
 * Handles pool resolution: final price capture, winner determination,
 * on-chain resolve, and RESOLVED → CLAIMABLE transitions.
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
   * JOINING is the normal flow (strike at creation, no ACTIVE phase).
   * ACTIVE is kept for backward compatibility with pre-migration pools.
   */
  async processResolutions(): Promise<void> {
    // Add 5-second buffer to account for Solana clock skew on devnet.
    // The on-chain resolve checks Clock::get().unix_timestamp >= end_time,
    // which can lag behind wall time by several seconds.
    const bufferMs = 5000;
    const cutoff = new Date(Date.now() - bufferMs);
    const poolsToResolve = await this.deps.prisma.pool.findMany({
      where: {
        status: { in: [PoolStatus.JOINING, PoolStatus.ACTIVE] },
        endTime: { lte: cutoff },
      },
    });

    await Promise.all(
      poolsToResolve.map((pool) => this.resolvePool(pool))
    );
  }

  /**
   * Transition RESOLVED pools to CLAIMABLE after a short delay.
   * Replaces fragile setTimeout — if server restarts, the next tick picks up stale pools.
   */
  async processClaimableTransitions(): Promise<void> {
    const twoSecondsAgo = new Date(Date.now() - 2000);
    const staleResolved = await this.deps.prisma.pool.findMany({
      where: {
        status: PoolStatus.RESOLVED,
        updatedAt: { lte: twoSecondsAgo },
      },
      select: { id: true },
    });

    for (const pool of staleResolved) {
      await this.deps.prisma.pool.update({
        where: { id: pool.id },
        data: { status: PoolStatus.CLAIMABLE },
      });
      emitPoolStatus(pool.id, { id: pool.id, status: 'CLAIMABLE' });
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
          status: { in: [PoolStatus.JOINING, PoolStatus.RESOLVED, PoolStatus.CLAIMABLE] },
          totalUp: BigInt(0),
          totalDown: BigInt(0),
          endTime: { lt: oneHourAgo },
        },
        select: { id: true },
      });

      if (emptyPools.length === 0) return 0;

      const ids = emptyPools.map(p => p.id);

      // Delete related records first (FK constraints)
      await this.deps.prisma.priceSnapshot.deleteMany({ where: { poolId: { in: ids } } });
      await this.deps.prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: { in: ids } } });
      await this.deps.prisma.pool.deleteMany({ where: { id: { in: ids } } });

      await this.logEvent('POOLS_CLEANUP', 'system', 'scheduler', {
        deletedCount: ids.length.toString(),
        poolIds: JSON.stringify(ids),
      });

      console.log(`[Scheduler] Cleaned up ${ids.length} empty pool(s)`);
      return ids.length;
    } catch (error) {
      console.error('[Scheduler] Failed to cleanup empty pools:', error);
      return 0;
    }
  }

  /**
   * Resolve a single pool: capture final price, determine winner.
   * Uses atomic status claim to prevent race conditions.
   */
  async resolvePool(pool: {
    id: string;
    poolId: string;
    asset: string;
    strikePrice: bigint | null;
    totalUp: bigint;
    totalDown: bigint;
  }): Promise<void> {
    if (!pool.strikePrice) {
      console.warn(`[Scheduler] Pool ${pool.id} has no strike price — cleaning up stuck pool`);
      await this.handleNoStrikePricePool(pool.id);
      return;
    }

    // Atomic claim: only one scheduler tick can resolve this pool
    // Try JOINING first (new flow), fall back to ACTIVE (backward compat)
    let claimed = await this.deps.prisma.pool.updateMany({
      where: { id: pool.id, status: PoolStatus.JOINING },
      data: { status: PoolStatus.RESOLVED },
    });
    if (claimed.count === 0) {
      claimed = await this.deps.prisma.pool.updateMany({
        where: { id: pool.id, status: PoolStatus.ACTIVE },
        data: { status: PoolStatus.RESOLVED },
      });
    }
    if (claimed.count === 0) return;

    try {
      const [priceTick, betCount] = await Promise.all([
        this.deps.priceProvider.getSpotPrice(pool.asset),
        this.deps.prisma.bet.count({ where: { poolId: pool.id } }),
      ]);
      const finalPrice = priceTick.price;
      const strikePrice = pool.strikePrice;

      // Store price snapshot (non-blocking)
      this.deps.prisma.priceSnapshot.create({
        data: {
          poolId: pool.id,
          type: 'FINAL',
          price: finalPrice,
          timestamp: priceTick.timestamp,
          source: priceTick.source,
          rawHash: priceTick.rawHash || '',
        },
      }).catch((err) => console.error(`[Scheduler] Failed to save price snapshot:`, err));

      console.log(
        `[Scheduler] Pool ${pool.id} resolution: strike=${strikePrice} final=${finalPrice} diff=${finalPrice - strikePrice}`,
      );

      // Empty pool — no winner, but still resolve on-chain so close_pool works
      if (betCount === 0) {
        await this.resolvePoolOnChain(pool.id, strikePrice, finalPrice);
        await this.deps.prisma.pool.update({
          where: { id: pool.id },
          data: { status: PoolStatus.CLAIMABLE, finalPrice },
        });
        await this.logEvent('POOL_RESOLVED', 'pool', pool.id, {
          reason: 'empty_pool',
          strikePrice: strikePrice.toString(),
          finalPrice: finalPrice.toString(),
        });
        console.log(`[Scheduler] Pool ${pool.id} → CLAIMABLE (empty, no bets)`);
        return;
      }

      // Single bettor — resolve on-chain with prices that make their side win, then auto-refund
      if (betCount === 1) {
        await this.handleSingleBettorRefund(pool.id, strikePrice, finalPrice, betCount);
        return;
      }

      // Determine winner
      let winner: Side;
      if (finalPrice > strikePrice) {
        winner = Side.UP;
      } else if (finalPrice < strikePrice) {
        winner = Side.DOWN;
      } else {
        winner = Side.DOWN; // Tie goes to DOWN
      }

      // One-sided pool — resolve on-chain with prices that make the side-with-bets win, then auto-refund
      const winningSideTotal = winner === Side.UP ? pool.totalUp : pool.totalDown;
      if (winningSideTotal === BigInt(0)) {
        await this.handleOneSidedRefund(pool.id, winner, strikePrice, finalPrice, betCount);
        return;
      }

      // Normal resolution — both sides have bets
      await this.resolvePoolOnChain(pool.id, strikePrice, finalPrice);

      await this.deps.prisma.pool.update({
        where: { id: pool.id },
        data: { finalPrice, winner },
      });

      // Reset streak for losers
      const losingSide = winner === Side.UP ? Side.DOWN : Side.UP;
      const losingBets = await this.deps.prisma.bet.findMany({
        where: { poolId: pool.id, side: losingSide },
        select: { walletAddress: true },
      });
      const losingWallets = [...new Set(losingBets.map((b) => b.walletAddress))];
      await Promise.all(losingWallets.map((wallet) => resetStreak(wallet)));

      await this.logEvent('POOL_RESOLVED', 'pool', pool.id, {
        strikePrice: strikePrice.toString(),
        finalPrice: finalPrice.toString(),
        winner,
        totalUp: pool.totalUp.toString(),
        totalDown: pool.totalDown.toString(),
      });

      emitPoolStatus(pool.id, {
        id: pool.id,
        status: 'RESOLVED',
        strikePrice: strikePrice.toString(),
        finalPrice: finalPrice.toString(),
        winner,
      });

      console.log(`[Scheduler] Pool ${pool.id} → RESOLVED: winner=${winner}, strike=${strikePrice}, final=${finalPrice}`);
    } catch (error) {
      console.error(`[Scheduler] Failed to resolve pool ${pool.id}, reverting to JOINING:`, error);
      await this.deps.prisma.pool.update({
        where: { id: pool.id },
        data: { status: PoolStatus.JOINING },
      }).catch(() => {});
    }
  }

  /**
   * Single bettor: resolve on-chain with prices that make the bettor's side win,
   * then auto-refund via on-chain refund instruction. Falls back to CLAIMABLE for manual claim.
   */
  private async handleSingleBettorRefund(
    poolId: string, strikePrice: bigint, finalPrice: bigint, betCount: number,
  ): Promise<void> {
    const soleBet = await this.deps.prisma.bet.findFirst({ where: { poolId } });

    if (!soleBet) {
      await this.deps.prisma.pool.update({
        where: { id: poolId },
        data: { status: PoolStatus.CLAIMABLE, finalPrice },
      });
      return;
    }

    // Resolve on-chain with prices that make the bettor's side win
    const { onChainStrike, onChainFinal } = this.pricesForSideWin(soleBet.side as Side);
    await this.resolvePoolOnChain(poolId, onChainStrike, onChainFinal);

    const winner = soleBet.side as Side;

    await this.deps.prisma.pool.update({
      where: { id: poolId },
      data: { finalPrice, winner },
    });

    // Auto-refund: try up to 3 times, then fall back to CLAIMABLE for manual claim
    const refundSuccess = await this.autoRefundBets(poolId, [soleBet]);

    if (refundSuccess) {
      // All bets refunded — mark pool as done
      await this.deps.prisma.pool.update({
        where: { id: poolId },
        data: { status: PoolStatus.CLAIMABLE },
      });
      await this.logEvent('POOL_REFUND', 'pool', poolId, {
        reason: 'single_bettor_auto',
        strikePrice: strikePrice.toString(),
        finalPrice: finalPrice.toString(),
        betCount: betCount.toString(),
        onChainWinner: winner,
      });
      console.log(`[Scheduler] Pool ${poolId} → auto-refunded (single bettor, winner=${winner})`);
    } else {
      // Refund failed after retries — leave as CLAIMABLE for manual claim
      await this.deps.prisma.pool.update({
        where: { id: poolId },
        data: { status: PoolStatus.CLAIMABLE },
      });
      await this.logEvent('POOL_REFUND', 'pool', poolId, {
        reason: 'single_bettor_manual_fallback',
        strikePrice: strikePrice.toString(),
        finalPrice: finalPrice.toString(),
        betCount: betCount.toString(),
        onChainWinner: winner,
      });
      console.log(`[Scheduler] Pool ${poolId} → CLAIMABLE (auto-refund failed, manual claim available)`);
    }

    emitPoolStatus(poolId, { id: poolId, status: 'CLAIMABLE' });
  }

  /**
   * One-sided pool: all bets on one side. Resolve on-chain with prices that make
   * the side-with-bets win, then auto-refund. Falls back to CLAIMABLE for manual claim.
   */
  private async handleOneSidedRefund(
    poolId: string, winner: Side, strikePrice: bigint, finalPrice: bigint, betCount: number,
  ): Promise<void> {
    // The actual winner has 0 bets. We want the OTHER side (with bets) to win.
    const sideWithBets = winner === Side.UP ? Side.DOWN : Side.UP;
    const { onChainStrike, onChainFinal } = this.pricesForSideWin(sideWithBets);

    await this.resolvePoolOnChain(poolId, onChainStrike, onChainFinal);

    await this.deps.prisma.pool.update({
      where: { id: poolId },
      data: { finalPrice, winner: sideWithBets },
    });

    // Get all bets to refund
    const bets = await this.deps.prisma.bet.findMany({
      where: { poolId, claimed: false },
    });

    // Auto-refund with 3 retries
    const refundSuccess = await this.autoRefundBets(poolId, bets);

    if (refundSuccess) {
      await this.deps.prisma.pool.update({
        where: { id: poolId },
        data: { status: PoolStatus.CLAIMABLE },
      });
      await this.logEvent('POOL_REFUND', 'pool', poolId, {
        reason: 'one_sided_auto',
        strikePrice: strikePrice.toString(),
        finalPrice: finalPrice.toString(),
        winner: sideWithBets,
        betCount: betCount.toString(),
      });
      console.log(`[Scheduler] Pool ${poolId} → auto-refunded (one-sided, winner=${sideWithBets})`);
    } else {
      await this.deps.prisma.pool.update({
        where: { id: poolId },
        data: { status: PoolStatus.CLAIMABLE },
      });
      await this.logEvent('POOL_REFUND', 'pool', poolId, {
        reason: 'one_sided_manual_fallback',
        strikePrice: strikePrice.toString(),
        finalPrice: finalPrice.toString(),
        winner: sideWithBets,
        betCount: betCount.toString(),
      });
      console.log(`[Scheduler] Pool ${poolId} → CLAIMABLE (auto-refund failed, manual claim available)`);
    }

    emitPoolStatus(poolId, { id: poolId, status: 'CLAIMABLE' });
  }

  /**
   * Handle a stuck ACTIVE pool that has no strike price.
   * If no bets → move straight to CLAIMABLE for cleanup.
   * If bets exist → resolve on-chain with synthetic prices, then auto-refund.
   */
  private async handleNoStrikePricePool(poolId: string): Promise<void> {
    try {
      const bets = await this.deps.prisma.bet.findMany({
        where: { poolId, claimed: false },
      });

      if (bets.length === 0) {
        await this.deps.prisma.pool.update({
          where: { id: poolId },
          data: { status: PoolStatus.CLAIMABLE },
        });
        await this.logEvent('POOL_STUCK_CLEANUP', 'pool', poolId, {
          reason: 'no_strike_price_no_bets',
        });
        emitPoolStatus(poolId, { id: poolId, status: 'CLAIMABLE' });
        console.log(`[Scheduler] Pool ${poolId} → CLAIMABLE (no strike price, no bets)`);
        return;
      }

      console.log(`[Scheduler] Pool ${poolId}: no strike price, resolving on-chain for ${bets.length} bet(s)`);

      // Determine which side has bets and make that side win
      const hasUp = bets.some(b => b.side === Side.UP);
      const hasDown = bets.some(b => b.side === Side.DOWN);
      let refundWinner: Side;

      if (hasUp && !hasDown) {
        refundWinner = Side.UP;
      } else if (hasDown && !hasUp) {
        refundWinner = Side.DOWN;
      } else {
        // Both sides have bets — DOWN wins by default (equal prices)
        refundWinner = Side.DOWN;
      }

      const { onChainStrike, onChainFinal } = this.pricesForSideWin(refundWinner);

      await this.resolvePoolOnChain(poolId, onChainStrike, onChainFinal);

      await this.deps.prisma.pool.update({
        where: { id: poolId },
        data: { status: PoolStatus.CLAIMABLE, winner: refundWinner },
      });

      // Auto-refund with 3 retries
      const refundSuccess = await this.autoRefundBets(poolId, bets);

      await this.logEvent('POOL_STUCK_CLEANUP', 'pool', poolId, {
        reason: 'no_strike_price_with_bets',
        refundedCount: bets.length.toString(),
        onChainWinner: refundWinner,
        autoRefund: refundSuccess ? 'success' : 'failed_manual_fallback',
      });
      emitPoolStatus(poolId, { id: poolId, status: 'CLAIMABLE' });
      console.log(`[Scheduler] Pool ${poolId} → CLAIMABLE (no strike price, ${bets.length} bet(s), winner=${refundWinner}, auto=${refundSuccess})`);
    } catch (error) {
      console.error(`[Scheduler] Failed to clean up stuck pool ${poolId}:`, error);
    }
  }

  /**
   * Auto-refund bets via on-chain refund instruction (authority-signed).
   * Retries up to REFUND_MAX_RETRIES times per bet. Returns true if ALL bets were refunded.
   */
  private async autoRefundBets(
    poolId: string,
    bets: Array<{ id: string; walletAddress: string; side: string; amount: bigint; claimed: boolean }>,
  ): Promise<boolean> {
    const unclaimedBets = bets.filter(b => !b.claimed);
    if (unclaimedBets.length === 0) return true;

    let allSuccess = true;

    for (const bet of unclaimedBets) {
      let success = false;

      for (let attempt = 1; attempt <= REFUND_MAX_RETRIES; attempt++) {
        try {
          await this.refundBetOnChain(poolId, bet.walletAddress);

          // Mark as claimed in DB
          await this.deps.prisma.bet.update({
            where: { id: bet.id },
            data: { claimed: true, payoutAmount: bet.amount },
          });

          await this.logEvent('BET_AUTO_REFUNDED', 'bet', bet.id, {
            poolId,
            walletAddress: bet.walletAddress,
            amount: bet.amount.toString(),
            attempt: attempt.toString(),
          });

          emitRefund(bet.walletAddress, {
            poolId,
            amount: bet.amount.toString(),
            txSignature: 'auto-refund',
          });

          console.log(`[Scheduler] Auto-refunded bet ${bet.id} (attempt ${attempt})`);
          success = true;
          break;
        } catch (error) {
          console.warn(
            `[Scheduler] Refund attempt ${attempt}/${REFUND_MAX_RETRIES} failed for bet ${bet.id}:`,
            error instanceof Error ? error.message : error,
          );

          if (attempt < REFUND_MAX_RETRIES) {
            // Wait before retry (exponential backoff: 2s, 4s)
            await new Promise(r => setTimeout(r, 2000 * attempt));
          }
        }
      }

      if (!success) {
        console.error(`[Scheduler] All ${REFUND_MAX_RETRIES} refund attempts failed for bet ${bet.id} — manual claim required`);
        allSuccess = false;
      }
    }

    return allSuccess;
  }

  /**
   * Send on-chain refund instruction for a single bet.
   * Authority signs — no user signature needed.
   */
  private async refundBetOnChain(poolId: string, walletAddress: string): Promise<string> {
    const seed = derivePoolSeed(poolId);
    const [poolPda] = getPoolPDA(seed);
    const [vaultPda] = getVaultPDA(seed);
    const user = new PublicKey(walletAddress);
    const [userBetPda] = getUserBetPDA(poolPda, user);
    const userTokenAccount = await getAssociatedTokenAddress(getUsdcMint(), user);

    const ix = buildRefundIx(
      poolPda,
      userBetPda,
      vaultPda,
      userTokenAccount,
      user,
      this.deps.wallet.publicKey,
    );

    const transaction = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await this.deps.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.deps.wallet.publicKey;
    transaction.sign(this.deps.wallet);

    const signature = await this.deps.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    const confirmation = await this.deps.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    if (confirmation.value.err) {
      throw new Error(`refund tx failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[Scheduler] refund tx confirmed: ${signature}`);
    return signature;
  }

  /**
   * Generate strike/final prices that make a given side win on-chain.
   * UP wins when finalPrice > strikePrice, DOWN wins when finalPrice <= strikePrice.
   */
  private pricesForSideWin(side: Side): { onChainStrike: bigint; onChainFinal: bigint } {
    if (side === Side.UP) {
      // UP wins: final > strike
      return { onChainStrike: BigInt(1000), onChainFinal: BigInt(2000) };
    }
    // DOWN wins: final <= strike (equal → DOWN wins)
    return { onChainStrike: BigInt(2000), onChainFinal: BigInt(1000) };
  }

  /**
   * Send on-chain resolve instruction.
   */
  private async resolvePoolOnChain(
    poolId: string, strikePrice: bigint, finalPrice: bigint,
  ): Promise<string> {
    const seed = derivePoolSeed(poolId);
    const [poolPda] = getPoolPDA(seed);

    console.log(`[Scheduler] Resolving on-chain pool:`);
    console.log(`[Scheduler]   Pool PDA: ${poolPda.toBase58()}`);
    console.log(`[Scheduler]   Strike: ${strikePrice}`);
    console.log(`[Scheduler]   Final: ${finalPrice}`);

    const ix = buildResolveIx(
      poolPda,
      this.deps.wallet.publicKey,
      strikePrice,
      finalPrice,
    );

    const transaction = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await this.deps.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.deps.wallet.publicKey;
    transaction.sign(this.deps.wallet);

    const signature = await this.deps.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    const confirmation = await this.deps.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    if (confirmation.value.err) {
      throw new Error(`resolve tx failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[Scheduler] resolve tx confirmed: ${signature}`);
    return signature;
  }

  /**
   * Close resolved pools whose vaults are empty (all claims/refunds done).
   * Reclaims ~0.0044 SOL rent per pool back to the authority.
   * Uses atomic status claim to prevent concurrent processing.
   */
  async processPoolClosures(): Promise<void> {
    if (this.closingInProgress) return;
    this.closingInProgress = true;

    try {
      // Find CLAIMABLE pools older than 30 seconds where all bets are claimed
      const cutoff = new Date(Date.now() - 30_000);
      const candidates = await this.deps.prisma.pool.findMany({
        where: {
          status: PoolStatus.CLAIMABLE,
          updatedAt: { lte: cutoff },
        },
        select: { id: true, poolId: true },
      });

      for (const pool of candidates) {
        // Skip pools that recently failed close (backoff to avoid RPC flooding)
        const lastFailure = this.closeFailures.get(pool.id);
        if (lastFailure && Date.now() - lastFailure < PoolResolver.CLOSE_RETRY_DELAY_MS) continue;

        // Check if any unclaimed bets remain
        const unclaimed = await this.deps.prisma.bet.count({
          where: { poolId: pool.id, claimed: false },
        });
        if (unclaimed > 0) continue;

        try {
          // Verify vault is actually empty on-chain before closing
          const closeSeed = derivePoolSeed(pool.id);
          const [closureVaultPda] = getVaultPDA(closeSeed);
          try {
            const vaultBalance = await this.deps.connection.getTokenAccountBalance(closureVaultPda);
            const vaultAmount = Number(vaultBalance.value.amount);
            if (vaultAmount > 0) {
              console.warn(`[Scheduler] Pool ${pool.id} vault still has ${vaultAmount} tokens — skipping close`);
              continue;
            }
          } catch {
            // Vault account might not exist (already closed) — that's fine, proceed
          }

          // Snapshot pool data before closing
          const poolData = await this.deps.prisma.pool.findUnique({ where: { id: pool.id } });
          const betCount = await this.deps.prisma.bet.count({ where: { poolId: pool.id } });

          // Measure rent reclaimed
          const balanceBefore = await this.deps.connection.getBalance(this.deps.wallet.publicKey);
          const txSig = await this.closePoolOnChain(pool.id);
          const balanceAfter = await this.deps.connection.getBalance(this.deps.wallet.publicKey);
          const rentReclaimed = balanceAfter - balanceBefore;

          // Log closure event BEFORE deleting records (entityType: 'closure' so it survives pool cleanup)
          await this.logEvent('POOL_CLOSED', 'closure', pool.id, {
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

          // Clean up DB records
          this.closeFailures.delete(pool.id);
          await this.deps.prisma.priceSnapshot.deleteMany({ where: { poolId: pool.id } });
          await this.deps.prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: pool.id } });
          await this.deps.prisma.bet.deleteMany({ where: { poolId: pool.id } });
          await this.deps.prisma.pool.deleteMany({ where: { id: pool.id } });

          console.log(`[Scheduler] Pool ${pool.id} closed on-chain & cleaned up (rent: +${(rentReclaimed / 1e9).toFixed(6)} SOL)`);
        } catch (error) {
          // Back off — don't retry for 5 minutes
          this.closeFailures.set(pool.id, Date.now());
          console.warn(
            `[Scheduler] Failed to close pool ${pool.id} (will retry in 5m):`,
            error instanceof Error ? error.message : error,
          );
        }
      }
    } catch (error) {
      console.error('[Scheduler] processPoolClosures error:', error);
    } finally {
      this.closingInProgress = false;
    }
  }

  /**
   * Send on-chain close_pool instruction to reclaim rent.
   * Verifies the pool account is actually closed after confirmation.
   */
  private async closePoolOnChain(poolId: string): Promise<string> {
    const seed = derivePoolSeed(poolId);
    const [poolPda] = getPoolPDA(seed);
    const [vaultPda] = getVaultPDA(seed);

    const ix = buildClosePoolIx(poolPda, vaultPda, this.deps.wallet.publicKey);

    const transaction = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await this.deps.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.deps.wallet.publicKey;
    transaction.sign(this.deps.wallet);

    const signature = await this.deps.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    const confirmation = await this.deps.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    if (confirmation.value.err) {
      throw new Error(`close_pool tx failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
    }

    // Verify the pool account is actually closed on-chain
    const poolAccount = await this.deps.connection.getAccountInfo(poolPda);
    if (poolAccount !== null) {
      throw new Error(`close_pool tx ${signature} confirmed but pool PDA still exists — tx may have been dropped`);
    }

    console.log(`[Scheduler] close_pool tx confirmed & verified: ${signature}`);
    return signature;
  }

  /**
   * Force-resolve a pool from admin panel. Reuses existing resolvePool logic.
   */
  async forceResolvePool(pool: {
    id: string;
    poolId: string;
    asset: string;
    strikePrice: bigint | null;
    totalUp: bigint;
    totalDown: bigint;
  }): Promise<void> {
    await this.resolvePool(pool);
  }

  /**
   * Force-refund all bets in a pool from admin panel.
   * Resolves on-chain with synthetic prices if needed, then auto-refunds all bets.
   */
  async forceRefundPool(poolId: string): Promise<void> {
    const pool = await this.deps.prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) throw new Error('Pool not found');

    const bets = await this.deps.prisma.bet.findMany({
      where: { poolId, claimed: false },
    });

    if (bets.length === 0) {
      // No unclaimed bets — just move to CLAIMABLE
      await this.deps.prisma.pool.update({
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

      const { onChainStrike, onChainFinal } = this.pricesForSideWin(refundWinner as unknown as import('@prisma/client').Side);

      // Claim status atomically
      await this.deps.prisma.pool.updateMany({
        where: { id: poolId, status: { in: [PoolStatus.JOINING, PoolStatus.ACTIVE] } },
        data: { status: PoolStatus.RESOLVED },
      });

      await this.resolvePoolOnChain(poolId, onChainStrike, onChainFinal);

      await this.deps.prisma.pool.update({
        where: { id: poolId },
        data: { status: PoolStatus.CLAIMABLE, winner: refundWinner as unknown as import('@prisma/client').Side },
      });
    }

    // Auto-refund all unclaimed bets
    await this.autoRefundBets(poolId, bets);
  }

  /**
   * Force-close a pool from admin panel.
   * Calls close_pool on-chain and cleans up DB records.
   */
  async forceClosePool(poolId: string): Promise<void> {
    // Snapshot pool data before closing
    const poolData = await this.deps.prisma.pool.findUnique({ where: { id: poolId } });
    const betCount = await this.deps.prisma.bet.count({ where: { poolId } });

    // Measure rent reclaimed
    const balanceBefore = await this.deps.connection.getBalance(this.deps.wallet.publicKey);
    const txSig = await this.closePoolOnChain(poolId);
    const balanceAfter = await this.deps.connection.getBalance(this.deps.wallet.publicKey);
    const rentReclaimed = balanceAfter - balanceBefore;

    // Log closure event BEFORE deleting records
    await this.logEvent('POOL_CLOSED', 'closure', poolId, {
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
    await this.deps.prisma.priceSnapshot.deleteMany({ where: { poolId } });
    await this.deps.prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: poolId } });
    await this.deps.prisma.bet.deleteMany({ where: { poolId } });
    await this.deps.prisma.pool.deleteMany({ where: { id: poolId } });
  }

  /**
   * Scan on-chain for orphaned pools (exist on-chain but deleted from DB).
   * Resolves and closes them to reclaim rent back to the authority wallet.
   */
  async recoverOrphanedPools(): Promise<{
    totalOnChain: number;
    totalInDb: number;
    orphaned: number;
    recovered: Array<{
      poolPda: string;
      asset: string;
      status: string;
      vaultBalance: number;
      action: string;
      rentReclaimed?: string;
      txSignature?: string;
      error?: string;
    }>;
  }> {
    const POOL_DISC = [241, 154, 109, 4, 17, 177, 109, 188];
    const STATUS_NAMES = ['Upcoming', 'Joining', 'Active', 'Resolved'];

    // 1. Get all accounts owned by our program
    const allAccounts = await this.deps.connection.getProgramAccounts(PROGRAM_ID);
    const poolAccounts = allAccounts.filter(a => {
      if (a.account.data.length < 8) return false;
      return POOL_DISC.every((b, i) => a.account.data[i] === b);
    });

    // 2. Get all pool PDA addresses from DB
    const dbPools = await this.deps.prisma.pool.findMany({ select: { poolId: true } });
    const dbPoolPdas = new Set(dbPools.map(p => p.poolId));

    // 3. Find orphaned (on-chain but not in DB)
    const orphaned = poolAccounts.filter(a => !dbPoolPdas.has(a.pubkey.toBase58()));

    const results: Array<{
      poolPda: string; asset: string; status: string; vaultBalance: number;
      action: string; rentReclaimed?: string; txSignature?: string; error?: string;
    }> = [];

    for (const account of orphaned) {
      const data = account.account.data;
      const poolPdaStr = account.pubkey.toBase58();

      // Parse pool data (Borsh layout)
      let offset = 8; // skip discriminator
      const poolSeed = data.slice(offset, offset + 32);
      offset += 32;

      // asset: Borsh string (u32 LE length + bytes)
      const assetLen = data.readUInt32LE(offset);
      offset += 4;
      const asset = data.slice(offset, offset + assetLen).toString('utf8');
      offset += assetLen;

      // skip authority(32) + usdcMint(32) + vault(32) + startTime(8) + endTime(8) + lockTime(8) + strikePrice(8) + finalPrice(8)
      offset += 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8;

      // totalUp + totalDown (8 each)
      offset += 8 + 8;

      // status (1 byte enum)
      const statusByte = data[offset];
      const status = STATUS_NAMES[statusByte] || `Unknown(${statusByte})`;

      // Derive vault PDA from on-chain seed
      const [vaultPda] = getVaultPDA(poolSeed);

      // Check vault balance
      let vaultBalance = 0;
      try {
        const balance = await this.deps.connection.getTokenAccountBalance(vaultPda);
        vaultBalance = Number(balance.value.amount);
      } catch {
        // Vault might already be closed — that's fine
      }

      // If vault has USDC, skip — needs manual refund first
      if (vaultBalance > 0) {
        results.push({
          poolPda: poolPdaStr, asset, status, vaultBalance,
          action: 'SKIPPED_HAS_FUNDS',
          error: `Vault has ${(vaultBalance / 1e6).toFixed(2)} USDC — needs manual refund first`,
        });
        continue;
      }

      try {
        // If not resolved, resolve first with synthetic prices
        if (statusByte !== 3) {
          const resolveIx = buildResolveIx(
            account.pubkey,
            this.deps.wallet.publicKey,
            BigInt(1000),
            BigInt(1000), // equal prices → doesn't matter for empty vault
          );

          const resolveTx = new Transaction().add(resolveIx);
          const { blockhash: rb, lastValidBlockHeight: rvbh } = await this.deps.connection.getLatestBlockhash();
          resolveTx.recentBlockhash = rb;
          resolveTx.feePayer = this.deps.wallet.publicKey;
          resolveTx.sign(this.deps.wallet);

          const resolveSig = await this.deps.connection.sendRawTransaction(resolveTx.serialize(), {
            skipPreflight: false, preflightCommitment: 'confirmed',
          });
          await this.deps.connection.confirmTransaction(
            { signature: resolveSig, blockhash: rb, lastValidBlockHeight: rvbh }, 'confirmed',
          );
          console.log(`[Recovery] Resolved orphaned pool ${poolPdaStr}: ${resolveSig}`);
        }

        // Close pool to reclaim rent
        const balanceBefore = await this.deps.connection.getBalance(this.deps.wallet.publicKey);

        const closeIx = buildClosePoolIx(account.pubkey, vaultPda, this.deps.wallet.publicKey);
        const closeTx = new Transaction().add(closeIx);
        const { blockhash: cb, lastValidBlockHeight: cvbh } = await this.deps.connection.getLatestBlockhash();
        closeTx.recentBlockhash = cb;
        closeTx.feePayer = this.deps.wallet.publicKey;
        closeTx.sign(this.deps.wallet);

        const closeSig = await this.deps.connection.sendRawTransaction(closeTx.serialize(), {
          skipPreflight: false, preflightCommitment: 'confirmed',
        });
        await this.deps.connection.confirmTransaction(
          { signature: closeSig, blockhash: cb, lastValidBlockHeight: cvbh }, 'confirmed',
        );

        // Verify closure
        const poolCheck = await this.deps.connection.getAccountInfo(account.pubkey);
        if (poolCheck !== null) {
          throw new Error('Pool PDA still exists after close tx');
        }

        const balanceAfter = await this.deps.connection.getBalance(this.deps.wallet.publicKey);
        const rentReclaimed = balanceAfter - balanceBefore;

        results.push({
          poolPda: poolPdaStr, asset, status, vaultBalance: 0,
          action: 'CLOSED',
          rentReclaimed: (rentReclaimed / 1e9).toFixed(6),
          txSignature: closeSig,
        });

        await this.logEvent('POOL_ORPHAN_RECOVERED', 'closure', poolPdaStr, {
          poolPda: poolPdaStr, asset, previousStatus: status,
          rentReclaimedLamports: rentReclaimed.toString(),
          rentReclaimedSol: (rentReclaimed / 1e9).toFixed(6),
          txSignature: closeSig,
        });

        console.log(`[Recovery] Closed orphaned pool ${poolPdaStr}: +${(rentReclaimed / 1e9).toFixed(6)} SOL`);
      } catch (error) {
        results.push({
          poolPda: poolPdaStr, asset, status, vaultBalance,
          action: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      totalOnChain: poolAccounts.length,
      totalInDb: dbPools.length,
      orphaned: orphaned.length,
      recovered: results,
    };
  }

  private async logEvent(
    eventType: string, entityType: string, entityId: string, payload: Record<string, string>,
  ): Promise<void> {
    await this.deps.prisma.eventLog.create({
      data: { eventType, entityType, entityId, payload: payload as Prisma.InputJsonValue },
    });
  }
}
