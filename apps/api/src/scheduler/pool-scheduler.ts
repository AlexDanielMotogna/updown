import cron from 'node-cron';
import crypto from 'crypto';
import { PrismaClient, PoolStatus, Side, Prisma } from '@prisma/client';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { PacificaProvider } from 'market-data';
import {
  getPoolPDA,
  getVaultPDA,
  PROGRAM_ID,
} from 'solana-client';
import { getSchedulerConfig, PoolTemplate } from './config';
import { emitNewPool, emitPoolStatus, emitRefund } from '../websocket';

const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);

const prisma = new PrismaClient();

/**
 * Pool Scheduler Service
 * Manages the full lifecycle of parimutuel pools
 */
export class PoolScheduler {
  private priceProvider: PacificaProvider;
  private connection: Connection;
  private wallet: Keypair;
  private jobs: cron.ScheduledTask[] = [];
  private isRunning = false;
  /** Per-template mutex to prevent concurrent pool creation races */
  private creationLocks = new Map<string, Promise<void>>();

  constructor() {
    this.priceProvider = new PacificaProvider();
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'http://localhost:8899',
      'confirmed'
    );

    // Load authority keypair from environment
    const secretKey = process.env.AUTHORITY_SECRET_KEY;
    const keypairPath = process.env.AUTHORITY_KEYPAIR_PATH;
    if (secretKey) {
      this.wallet = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(secretKey))
      );
    } else if (keypairPath) {
      const fs = require('fs');
      const path = require('path');
      const resolvedPath = keypairPath.startsWith('~')
        ? path.join(process.env.HOME || '', keypairPath.slice(1))
        : keypairPath;
      const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
      this.wallet = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fileContent))
      );
      console.log(`[Scheduler] Loaded authority keypair from ${keypairPath}`);
    } else {
      // Development fallback - generate random keypair
      console.warn('[Scheduler] No AUTHORITY_SECRET_KEY or AUTHORITY_KEYPAIR_PATH found, using random keypair');
      this.wallet = Keypair.generate();
    }
  }

  /**
   * Initialize the scheduler and start cron jobs
   */
  async start(): Promise<void> {
    const config = getSchedulerConfig();

    if (!config.enabled) {
      console.log('[Scheduler] Disabled via configuration');
      return;
    }

    console.log('[Scheduler] Starting pool scheduler...');
    console.log(`[Scheduler] Authority: ${this.wallet.publicKey.toBase58()}`);

    // Check price provider health
    const healthy = await this.priceProvider.isHealthy();
    if (!healthy) {
      console.error('[Scheduler] Price provider is not healthy');
      throw new Error('Price provider health check failed');
    }

    // ── Startup: clean up duplicate JOINING pools ──
    await this.cleanupDuplicateJoiningPools(config.templates);

    // ── Startup: bootstrap one JOINING pool per template if missing ──
    for (const template of config.templates) {
      await this.ensureJoiningPool(template);
    }

    // ── Cron: safety-net guard — only creates if no JOINING pool exists ──
    for (const template of config.templates) {
      const job = cron.schedule(template.cronExpression, async () => {
        await this.ensureJoiningPool(template);
      });
      this.jobs.push(job);
      console.log(`[Scheduler] Guard for ${template.asset}/${template.intervalKey}: ${template.cronExpression}`);
    }

    // Schedule status transition job (every 2 seconds for responsive transitions)
    const transitionJob = cron.schedule('*/2 * * * * *', async () => {
      await this.processStatusTransitions();
      await this.processResolutions();
    });
    this.jobs.push(transitionJob);
    console.log('[Scheduler] Scheduled transition & resolution job: every 2 seconds');

    // Schedule periodic dedup cleanup (every 30 seconds) as safety net
    const dedupJob = cron.schedule('*/30 * * * * *', async () => {
      await this.cleanupDuplicateJoiningPools(config.templates);
    });
    this.jobs.push(dedupJob);

    // Schedule cleanup job for empty pools (every hour at :30)
    const cleanupJob = cron.schedule('30 * * * *', async () => {
      await this.cleanupEmptyPools();
    });
    this.jobs.push(cleanupJob);
    console.log('[Scheduler] Scheduled cleanup jobs');

    this.isRunning = true;
    console.log('[Scheduler] Pool scheduler started successfully');
  }

  /**
   * Ensure exactly one JOINING pool exists for a given template.
   * Uses an in-process mutex + database check inside createPool for safety.
   */
  private async ensureJoiningPool(template: PoolTemplate): Promise<void> {
    const key = `${template.asset}/${template.intervalKey}`;

    // If another call is already creating for this template, skip
    const pending = this.creationLocks.get(key);
    if (pending) {
      return;
    }

    const work = (async () => {
      const existing = await prisma.pool.findFirst({
        where: {
          asset: template.asset,
          interval: template.intervalKey,
          status: PoolStatus.JOINING,
        },
      });

      if (existing) return;

      console.log(`[Scheduler] No JOINING pool for ${key}, creating one`);
      await this.createPool(template);
    })();

    this.creationLocks.set(key, work);
    try {
      await work;
    } finally {
      if (this.creationLocks.get(key) === work) {
        this.creationLocks.delete(key);
      }
    }
  }

  /**
   * On startup, remove duplicate JOINING pools per asset+interval.
   * Keeps the one with the latest lockTime, removes the rest.
   */
  private async cleanupDuplicateJoiningPools(templates: PoolTemplate[]): Promise<void> {
    for (const template of templates) {
      const joiningPools = await prisma.pool.findMany({
        where: {
          asset: template.asset,
          interval: template.intervalKey,
          status: PoolStatus.JOINING,
        },
        orderBy: { lockTime: 'desc' },
      });

      if (joiningPools.length <= 1) continue;

      // Keep the first (latest lockTime), delete the rest
      const toDelete = joiningPools.slice(1);
      for (const pool of toDelete) {
        // Only delete if no bets placed
        const betCount = await prisma.bet.count({ where: { poolId: pool.id } });
        if (betCount === 0) {
          await prisma.priceSnapshot.deleteMany({ where: { poolId: pool.id } });
          await prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: pool.id } });
          await prisma.pool.delete({ where: { id: pool.id } });
          console.log(`[Scheduler] Removed duplicate JOINING pool ${pool.id} (${pool.asset}/${pool.interval})`);
        }
      }
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs = [];
    this.isRunning = false;
    console.log('[Scheduler] Pool scheduler stopped');
  }

  /**
   * Create a new pool based on template.
   * Includes a final database-level dedup check to prevent duplicates
   * even across process restarts.
   */
  async createPool(template: PoolTemplate): Promise<string | null> {
    // Final dedup guard: if a JOINING pool was created between the caller's
    // check and this point (e.g., by a concurrent process), bail out.
    const duplicate = await prisma.pool.findFirst({
      where: {
        asset: template.asset,
        interval: template.intervalKey,
        status: PoolStatus.JOINING,
      },
    });
    if (duplicate) {
      console.log(`[Scheduler] Skipping ${template.asset}/${template.intervalKey} — JOINING pool already exists`);
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const poolId = crypto.randomBytes(32);
    const poolIdArray = Array.from(poolId);

    // Align lockTime to the next clean clock boundary for this interval.
    // e.g., 1m pools always lock at :00, 5m pools at :00/:05/:10, etc.
    // This ensures all pools of the same interval are perfectly synchronized.
    const interval = template.interval;
    const lockTime = Math.floor(now / interval) * interval + interval;
    const startTime = lockTime;
    const endTime = lockTime + interval;

    console.log(`[Scheduler] Creating ${template.asset}/${template.intervalKey} pool...`);
    console.log(`[Scheduler]   Lock: ${new Date(lockTime * 1000).toISOString()}`);
    console.log(`[Scheduler]   Start: ${new Date(startTime * 1000).toISOString()}`);
    console.log(`[Scheduler]   End: ${new Date(endTime * 1000).toISOString()}`);

    try {
      // Get PDAs
      const [poolPda] = getPoolPDA(poolId);
      const [vaultPda] = getVaultPDA(poolId);

      // Get USDC mint (use devnet USDC or configurable)
      const usdcMint = new PublicKey(
        process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // Mainnet USDC
      );

      // Create pool on-chain (if Solana program is deployed)
      if (process.env.SOLANA_RPC_URL) {
        try {
          await this.initializePoolOnChain(
            poolIdArray,
            template.asset,
            startTime,
            endTime,
            lockTime,
            usdcMint
          );
        } catch (error) {
          console.error('[Scheduler] Failed to create pool on-chain:', error);
          // Continue to create in database for tracking
        }
      }

      // Create pool directly as JOINING (lockTime is always in the future)
      const pool = await prisma.pool.create({
        data: {
          poolId: poolPda.toBase58(),
          asset: template.asset,
          interval: template.intervalKey,
          durationSeconds: template.interval,
          status: PoolStatus.JOINING,
          lockTime: new Date(lockTime * 1000),
          startTime: new Date(startTime * 1000),
          endTime: new Date(endTime * 1000),
          totalUp: BigInt(0),
          totalDown: BigInt(0),
        },
      });

      // Log event
      await this.logEvent('POOL_CREATED', 'pool', pool.id, {
        poolId: poolPda.toBase58(),
        asset: template.asset,
        lockTime: lockTime.toString(),
        startTime: startTime.toString(),
        endTime: endTime.toString(),
      });

      console.log(`[Scheduler] Pool created: ${pool.id} (${poolPda.toBase58()})`);

      // Emit WebSocket event for new pool (already JOINING)
      emitNewPool({
        id: pool.id,
        poolId: pool.poolId,
        asset: pool.asset,
        interval: pool.interval,
        durationSeconds: pool.durationSeconds,
        status: 'JOINING',
        startTime: pool.startTime.toISOString(),
        endTime: pool.endTime.toISOString(),
        lockTime: pool.lockTime.toISOString(),
        totalUp: '0',
        totalDown: '0',
        totalPool: '0',
      });

      return pool.id;
    } catch (error) {
      console.error(`[Scheduler] Failed to create pool:`, error);
      return null;
    }
  }

  /**
   * Initialize pool on Solana blockchain
   * Note: This is a placeholder - full Anchor integration requires
   * proper IDL loading and program instantiation
   */
  private async initializePoolOnChain(
    poolId: number[],
    asset: string,
    startTime: number,
    endTime: number,
    lockTime: number,
    usdcMint: PublicKey
  ): Promise<string> {
    // For now, log the intent - full Anchor integration will be added
    // when the program is deployed to devnet/mainnet
    const [poolPda] = getPoolPDA(Uint8Array.from(poolId));
    const [vaultPda] = getVaultPDA(Uint8Array.from(poolId));

    console.log(`[Scheduler] Would initialize on-chain pool:`);
    console.log(`[Scheduler]   Pool PDA: ${poolPda.toBase58()}`);
    console.log(`[Scheduler]   Vault PDA: ${vaultPda.toBase58()}`);
    console.log(`[Scheduler]   Asset: ${asset}`);
    console.log(`[Scheduler]   Times: lock=${lockTime}, start=${startTime}, end=${endTime}`);

    // TODO: Implement full Anchor program call when deployed
    // This requires proper IDL loading compatible with Anchor 0.31.x
    return 'pending-onchain-integration';
  }

  /**
   * Process pool status transitions
   * JOINING → ACTIVE (at lock_time, capture strike price)
   */
  async processStatusTransitions(): Promise<void> {
    const now = new Date();

    // Transition JOINING → ACTIVE (at lock_time, capture strike price)
    const poolsToActivate = await prisma.pool.findMany({
      where: {
        status: PoolStatus.JOINING,
        lockTime: { lte: now },
      },
    });

    for (const pool of poolsToActivate) {
      await this.activatePool(pool.id, pool.asset, pool.interval);
    }
  }

  /**
   * Activate a pool: capture strike price, transition to ACTIVE,
   * then immediately create the successor JOINING pool for the same asset+interval.
   */
  private async activatePool(poolId: string, asset: string, interval: string | null): Promise<void> {
    try {
      // Get strike price from market data
      const priceTick = await this.priceProvider.getSpotPrice(asset);
      const strikePrice = priceTick.price;

      // Update pool status and strike price
      await prisma.pool.update({
        where: { id: poolId },
        data: {
          status: PoolStatus.ACTIVE,
          strikePrice,
        },
      });

      // Store price snapshot for audit
      await prisma.priceSnapshot.create({
        data: {
          poolId,
          type: 'STRIKE',
          price: strikePrice,
          timestamp: priceTick.timestamp,
          source: priceTick.source,
          rawHash: priceTick.rawHash || '',
        },
      });

      await this.logEvent('POOL_ACTIVATED', 'pool', poolId, {
        strikePrice: strikePrice.toString(),
        source: priceTick.source,
      });

      // Emit WebSocket event
      emitPoolStatus(poolId, {
        id: poolId,
        status: 'ACTIVE',
        strikePrice: strikePrice.toString(),
      });

      console.log(`[Scheduler] Pool ${poolId} → ACTIVE with strike price: ${strikePrice}`);

      // ── Create successor JOINING pool for the same asset+interval ──
      if (interval) {
        const config = getSchedulerConfig();
        const template = config.templates.find(
          (t) => t.asset === asset && t.intervalKey === interval
        );
        if (template) {
          await this.ensureJoiningPool(template);
        }
      }
    } catch (error) {
      console.error(`[Scheduler] Failed to activate pool ${poolId}:`, error);
    }
  }

  /**
   * Process pool resolutions
   * ACTIVE → RESOLVED (at end_time, capture final price and determine winner)
   */
  async processResolutions(): Promise<void> {
    const now = new Date();

    const poolsToResolve = await prisma.pool.findMany({
      where: {
        status: PoolStatus.ACTIVE,
        endTime: { lte: now },
      },
    });

    for (const pool of poolsToResolve) {
      await this.resolvePool(pool);
    }
  }

  /**
   * Delete resolved/claimable pools that had zero participants.
   * Removes related PriceSnapshots first, then the pool rows.
   */
  async cleanupEmptyPools(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    try {
      const emptyPools = await prisma.pool.findMany({
        where: {
          status: { in: [PoolStatus.RESOLVED, PoolStatus.CLAIMABLE] },
          totalUp: BigInt(0),
          totalDown: BigInt(0),
          endTime: { lt: oneHourAgo },
        },
        select: { id: true },
      });

      if (emptyPools.length === 0) {
        return 0;
      }

      const ids = emptyPools.map(p => p.id);

      // Delete related price snapshots first (FK constraint)
      await prisma.priceSnapshot.deleteMany({
        where: { poolId: { in: ids } },
      });

      // Delete related event logs
      await prisma.eventLog.deleteMany({
        where: { entityType: 'pool', entityId: { in: ids } },
      });

      // Delete the empty pools
      await prisma.pool.deleteMany({
        where: { id: { in: ids } },
      });

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
   * Resolve a pool: capture final price, determine winner, call program
   */
  private async resolvePool(pool: {
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

    try {
      // Check if pool has only 1 bettor — direct refund without win/loss
      const betCount = await prisma.bet.count({ where: { poolId: pool.id } });
      if (betCount <= 1) {
        const soleBet = await prisma.bet.findFirst({ where: { poolId: pool.id } });

        if (soleBet && !soleBet.claimed) {
          // Attempt direct on-chain refund
          const refundTx = await this.refundBet(soleBet);

          if (refundTx) {
            // Mark bet as claimed with the refund tx
            await prisma.bet.update({
              where: { id: soleBet.id },
              data: {
                claimed: true,
                claimTx: refundTx,
                payoutAmount: soleBet.amount,
              },
            });

            // Notify frontend via WebSocket
            emitRefund(soleBet.walletAddress, {
              poolId: pool.id,
              amount: soleBet.amount.toString(),
              txSignature: refundTx,
            });

            console.log(`[Scheduler] Pool ${pool.id}: refunded ${soleBet.amount} to ${soleBet.walletAddress} (tx: ${refundTx})`);
          } else {
            console.warn(`[Scheduler] Pool ${pool.id}: on-chain refund failed, falling back to claimable`);
          }
        }

        // Mark pool as resolved regardless
        const winner = soleBet ? soleBet.side : Side.UP;
        await prisma.pool.update({
          where: { id: pool.id },
          data: {
            status: PoolStatus.CLAIMABLE,
            finalPrice: pool.strikePrice,
            winner,
          },
        });

        await this.logEvent('POOL_REFUND', 'pool', pool.id, {
          reason: 'single_bettor',
          betCount: betCount.toString(),
          refunded: (soleBet?.claimed || !!soleBet).toString(),
        });

        emitPoolStatus(pool.id, {
          id: pool.id,
          status: 'CLAIMABLE',
        });

        console.log(`[Scheduler] Pool ${pool.id} → CLAIMABLE (single bettor)`);
        return;
      }

      // Get final price from market data
      const priceTick = await this.priceProvider.getSpotPrice(pool.asset);
      const finalPrice = priceTick.price;
      const strikePrice = pool.strikePrice;

      // Determine winner
      let winner: Side;
      if (finalPrice > strikePrice) {
        winner = Side.UP;
      } else if (finalPrice < strikePrice) {
        winner = Side.DOWN;
      } else {
        // Tie goes to DOWN (price didn't go up)
        winner = Side.DOWN;
      }

      // Resolve on-chain if program is deployed
      if (process.env.SOLANA_RPC_URL) {
        try {
          await this.resolvePoolOnChain(pool.poolId, strikePrice, finalPrice);
        } catch (error) {
          console.error(`[Scheduler] Failed to resolve pool on-chain:`, error);
          // Continue to update database
        }
      }

      // Update pool in database
      await prisma.pool.update({
        where: { id: pool.id },
        data: {
          status: PoolStatus.RESOLVED,
          finalPrice,
          winner,
        },
      });

      // Store price snapshot for audit
      await prisma.priceSnapshot.create({
        data: {
          poolId: pool.id,
          type: 'FINAL',
          price: finalPrice,
          timestamp: priceTick.timestamp,
          source: priceTick.source,
          rawHash: priceTick.rawHash || '',
        },
      });

      await this.logEvent('POOL_RESOLVED', 'pool', pool.id, {
        strikePrice: strikePrice.toString(),
        finalPrice: finalPrice.toString(),
        winner,
        totalUp: pool.totalUp.toString(),
        totalDown: pool.totalDown.toString(),
      });

      // Emit WebSocket event for RESOLVED
      emitPoolStatus(pool.id, {
        id: pool.id,
        status: 'RESOLVED',
        strikePrice: strikePrice.toString(),
        finalPrice: finalPrice.toString(),
        winner,
      });

      console.log(`[Scheduler] Pool ${pool.id} → RESOLVED: winner=${winner}, final=${finalPrice}`);

      // Transition to CLAIMABLE after short delay
      setTimeout(async () => {
        await prisma.pool.update({
          where: { id: pool.id },
          data: { status: PoolStatus.CLAIMABLE },
        });

        // Emit WebSocket event for CLAIMABLE
        emitPoolStatus(pool.id, {
          id: pool.id,
          status: 'CLAIMABLE',
        });

        console.log(`[Scheduler] Pool ${pool.id} → CLAIMABLE`);
      }, 5000);
    } catch (error) {
      console.error(`[Scheduler] Failed to resolve pool ${pool.id}:`, error);
    }
  }

  /**
   * Resolve pool on Solana blockchain
   * Note: This is a placeholder - full Anchor integration requires
   * proper IDL loading and program instantiation
   */
  private async resolvePoolOnChain(
    poolPubkey: string,
    strikePrice: bigint,
    finalPrice: bigint
  ): Promise<string> {
    console.log(`[Scheduler] Would resolve on-chain pool:`);
    console.log(`[Scheduler]   Pool: ${poolPubkey}`);
    console.log(`[Scheduler]   Strike: ${strikePrice}`);
    console.log(`[Scheduler]   Final: ${finalPrice}`);

    // TODO: Implement full Anchor program call when deployed
    // This requires proper IDL loading compatible with Anchor 0.31.x
    return 'pending-onchain-integration';
  }

  /**
   * Refund a single bet by transferring USDC back to the user
   * Returns the tx signature on success, null on failure
   */
  private async refundBet(bet: {
    id: string;
    walletAddress: string;
    amount: bigint;
  }): Promise<string | null> {
    try {
      const userPubkey = new PublicKey(bet.walletAddress);
      const authorityATA = await getAssociatedTokenAddress(USDC_MINT, this.wallet.publicKey);
      const userATA = await getAssociatedTokenAddress(USDC_MINT, userPubkey);

      const transaction = new Transaction();

      // Create user's ATA if it doesn't exist
      const userATAInfo = await this.connection.getAccountInfo(userATA);
      if (!userATAInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.wallet.publicKey,
            userATA,
            userPubkey,
            USDC_MINT,
          ),
        );
      }

      // Transfer USDC from authority back to user
      transaction.add(
        createTransferInstruction(
          authorityATA,
          userATA,
          this.wallet.publicKey,
          BigInt(bet.amount),
          [],
          TOKEN_PROGRAM_ID,
        ),
      );

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.wallet.publicKey;
      transaction.sign(this.wallet);

      const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      const confirmation = await this.connection.confirmTransaction(
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

  /**
   * Log an event for audit trail
   */
  private async logEvent(
    eventType: string,
    entityType: string,
    entityId: string,
    payload: Record<string, string>
  ): Promise<void> {
    await prisma.eventLog.create({
      data: {
        eventType,
        entityType,
        entityId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Manually create a pool (for testing or admin)
   */
  async createPoolManual(
    asset: string,
    intervalSeconds: number,
    joinWindowSeconds: number,
    intervalKey: string = '1h',
    lockBufferSeconds: number = 60
  ): Promise<string | null> {
    return this.createPool({
      asset,
      intervalKey,
      interval: intervalSeconds,
      cronExpression: '', // Not used for manual creation
      joinWindowSeconds,
      lockBufferSeconds,
    });
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    jobCount: number;
    authority: string;
  } {
    return {
      isRunning: this.isRunning,
      jobCount: this.jobs.length,
      authority: this.wallet.publicKey.toBase58(),
    };
  }
}

// Singleton instance
let schedulerInstance: PoolScheduler | null = null;

export function getScheduler(): PoolScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new PoolScheduler();
  }
  return schedulerInstance;
}
