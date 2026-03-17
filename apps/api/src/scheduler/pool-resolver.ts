import { PrismaClient, PoolStatus, Side, Prisma } from '@prisma/client';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { PacificaProvider } from 'market-data';
import { emitPoolStatus, emitRefund } from '../websocket';
import { resetStreak } from '../services/rewards';
import { getUsdcMint } from '../utils/solana';

export interface ResolverDeps {
  prisma: PrismaClient;
  connection: Connection;
  wallet: Keypair;
  priceProvider: PacificaProvider;
}

/**
 * Handles pool resolution: final price capture, winner determination,
 * refunds for edge cases, and RESOLVED → CLAIMABLE transitions.
 */
export class PoolResolver {
  constructor(private deps: ResolverDeps) {}

  /**
   * Find and resolve all ACTIVE pools past their endTime.
   */
  async processResolutions(): Promise<void> {
    const now = new Date();
    const poolsToResolve = await this.deps.prisma.pool.findMany({
      where: {
        status: PoolStatus.ACTIVE,
        endTime: { lte: now },
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
          status: { in: [PoolStatus.RESOLVED, PoolStatus.CLAIMABLE] },
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
      console.error(`[Scheduler] Cannot resolve pool ${pool.id}: no strike price`);
      return;
    }

    // Atomic claim: only one scheduler tick can resolve this pool
    const claimed = await this.deps.prisma.pool.updateMany({
      where: { id: pool.id, status: PoolStatus.ACTIVE },
      data: { status: PoolStatus.RESOLVED },
    });
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

      // Empty pool — no winner
      if (betCount === 0) {
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

      // Single bettor — refund
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

      // One-sided pool — refund everyone
      const winningSideTotal = winner === Side.UP ? pool.totalUp : pool.totalDown;
      if (winningSideTotal === BigInt(0)) {
        await this.handleOneSidedRefund(pool.id, winner, strikePrice, finalPrice, betCount);
        return;
      }

      // Normal resolution — both sides have bets
      if (process.env.SOLANA_RPC_URL) {
        try {
          await this.resolvePoolOnChain(pool.poolId, strikePrice, finalPrice);
        } catch (error) {
          console.error(`[Scheduler] Failed to resolve pool on-chain:`, error);
        }
      }

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
      console.error(`[Scheduler] Failed to resolve pool ${pool.id}, reverting to ACTIVE:`, error);
      await this.deps.prisma.pool.update({
        where: { id: pool.id },
        data: { status: PoolStatus.ACTIVE },
      }).catch(() => {});
    }
  }

  private async handleSingleBettorRefund(
    poolId: string, strikePrice: bigint, finalPrice: bigint, betCount: number,
  ): Promise<void> {
    const soleBet = await this.deps.prisma.bet.findFirst({ where: { poolId } });

    if (soleBet && !soleBet.claimed) {
      const refundTx = await this.refundBet(soleBet);
      if (refundTx) {
        await this.deps.prisma.bet.update({
          where: { id: soleBet.id },
          data: { claimed: true, claimTx: refundTx, payoutAmount: soleBet.amount },
        });
        emitRefund(soleBet.walletAddress, {
          poolId,
          amount: soleBet.amount.toString(),
          txSignature: refundTx,
        });
        console.log(`[Scheduler] Pool ${poolId}: refunded ${soleBet.amount} to ${soleBet.walletAddress} (tx: ${refundTx})`);
      } else {
        console.warn(`[Scheduler] Pool ${poolId}: on-chain refund failed, falling back to claimable`);
      }
    }

    const winner: Side = finalPrice > strikePrice ? Side.UP : Side.DOWN;

    await this.deps.prisma.pool.update({
      where: { id: poolId },
      data: { status: PoolStatus.CLAIMABLE, finalPrice, winner },
    });
    await this.logEvent('POOL_REFUND', 'pool', poolId, {
      reason: 'single_bettor',
      strikePrice: strikePrice.toString(),
      finalPrice: finalPrice.toString(),
      betCount: betCount.toString(),
      refunded: (soleBet?.claimed || !!soleBet).toString(),
    });
    emitPoolStatus(poolId, { id: poolId, status: 'CLAIMABLE' });
    console.log(`[Scheduler] Pool ${poolId} → CLAIMABLE (single bettor, winner=${winner})`);
  }

  private async handleOneSidedRefund(
    poolId: string, winner: Side, strikePrice: bigint, finalPrice: bigint, betCount: number,
  ): Promise<void> {
    const allBets = await this.deps.prisma.bet.findMany({
      where: { poolId, claimed: false },
    });

    console.log(`[Scheduler] Pool ${poolId}: winning side (${winner}) has 0 bets — refunding ${allBets.length} bettor(s)`);

    for (const bet of allBets) {
      const refundTx = await this.refundBet(bet);
      if (refundTx) {
        await this.deps.prisma.bet.update({
          where: { id: bet.id },
          data: { claimed: true, claimTx: refundTx, payoutAmount: bet.amount },
        });
        emitRefund(bet.walletAddress, {
          poolId,
          amount: bet.amount.toString(),
          txSignature: refundTx,
        });
        console.log(`[Scheduler] Pool ${poolId}: refunded ${bet.amount} to ${bet.walletAddress} (tx: ${refundTx})`);
      } else {
        console.warn(`[Scheduler] Pool ${poolId}: failed to refund bet ${bet.id} for ${bet.walletAddress}`);
      }
    }

    await this.deps.prisma.pool.update({
      where: { id: poolId },
      data: { status: PoolStatus.CLAIMABLE, finalPrice, winner },
    });
    await this.logEvent('POOL_REFUND', 'pool', poolId, {
      reason: 'one_sided_pool',
      strikePrice: strikePrice.toString(),
      finalPrice: finalPrice.toString(),
      winner,
      betCount: betCount.toString(),
      refundedCount: allBets.length.toString(),
    });
    emitPoolStatus(poolId, { id: poolId, status: 'CLAIMABLE' });
    console.log(`[Scheduler] Pool ${poolId} → CLAIMABLE (one-sided, all refunded)`);
  }

  /**
   * Refund a single bet by transferring USDC back to the user.
   */
  async refundBet(bet: {
    id: string;
    walletAddress: string;
    amount: bigint;
  }): Promise<string | null> {
    try {
      const userPubkey = new PublicKey(bet.walletAddress);
      const usdcMint = getUsdcMint();
      const authorityATA = await getAssociatedTokenAddress(usdcMint, this.deps.wallet.publicKey);
      const userATA = await getAssociatedTokenAddress(usdcMint, userPubkey);

      const transaction = new Transaction();

      const userATAInfo = await this.deps.connection.getAccountInfo(userATA);
      if (!userATAInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.deps.wallet.publicKey, userATA, userPubkey, usdcMint,
          ),
        );
      }

      transaction.add(
        createTransferInstruction(
          authorityATA, userATA, this.deps.wallet.publicKey,
          BigInt(bet.amount), [], TOKEN_PROGRAM_ID,
        ),
      );

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
        console.error(`[Scheduler] Refund tx failed on-chain:`, confirmation.value.err);
        return null;
      }

      return signature;
    } catch (error) {
      console.error(`[Scheduler] Failed to refund bet ${bet.id}:`, error);
      return null;
    }
  }

  private async resolvePoolOnChain(
    poolPubkey: string, strikePrice: bigint, finalPrice: bigint,
  ): Promise<string> {
    console.log(`[Scheduler] Would resolve on-chain pool:`);
    console.log(`[Scheduler]   Pool: ${poolPubkey}`);
    console.log(`[Scheduler]   Strike: ${strikePrice}`);
    console.log(`[Scheduler]   Final: ${finalPrice}`);
    // TODO: Implement full Anchor program call when deployed
    return 'pending-onchain-integration';
  }

  private async logEvent(
    eventType: string, entityType: string, entityId: string, payload: Record<string, string>,
  ): Promise<void> {
    await this.deps.prisma.eventLog.create({
      data: { eventType, entityType, entityId, payload: payload as Prisma.InputJsonValue },
    });
  }
}
