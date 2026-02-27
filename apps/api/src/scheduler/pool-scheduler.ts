import cron from 'node-cron';
import crypto from 'crypto';
import { PrismaClient, PoolStatus, Side, Prisma } from '@prisma/client';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PacificaProvider } from 'market-data';
import {
  getPoolPDA,
  getVaultPDA,
  PROGRAM_ID,
} from 'solana-client';
import { getSchedulerConfig, PoolTemplate } from './config';
import { emitNewPool, emitPoolStatus } from '../websocket';

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

  constructor() {
    this.priceProvider = new PacificaProvider();
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'http://localhost:8899',
      'confirmed'
    );

    // Load authority keypair from environment
    const secretKey = process.env.AUTHORITY_SECRET_KEY;
    if (secretKey) {
      this.wallet = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(secretKey))
      );
    } else {
      // Development fallback - generate random keypair
      console.warn('[Scheduler] No AUTHORITY_SECRET_KEY found, using random keypair');
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

    // Schedule pool creation jobs for each template
    for (const template of config.templates) {
      const job = cron.schedule(template.cronExpression, async () => {
        await this.createPool(template);
      });
      this.jobs.push(job);
      console.log(`[Scheduler] Scheduled ${template.asset} pool creation: ${template.cronExpression}`);
    }

    // Schedule status transition job (runs every 5 seconds for 1m turbo pools)
    const transitionJob = cron.schedule('*/5 * * * * *', async () => {
      await this.processStatusTransitions();
    });
    this.jobs.push(transitionJob);
    console.log('[Scheduler] Scheduled status transition job: every 5 seconds');

    // Schedule resolution job (runs every 5 seconds for 1m turbo pools)
    const resolveJob = cron.schedule('*/5 * * * * *', async () => {
      await this.processResolutions();
    });
    this.jobs.push(resolveJob);
    console.log('[Scheduler] Scheduled resolution job: every 5 seconds');

    // Schedule cleanup job for empty pools (every hour at :30)
    const cleanupJob = cron.schedule('30 * * * *', async () => {
      await this.cleanupEmptyPools();
    });
    this.jobs.push(cleanupJob);
    console.log('[Scheduler] Scheduled empty pool cleanup job: every hour at :30');

    this.isRunning = true;
    console.log('[Scheduler] Pool scheduler started successfully');
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
   * Create a new pool based on template
   */
  async createPool(template: PoolTemplate): Promise<string | null> {
    const now = Math.floor(Date.now() / 1000);
    const poolId = crypto.randomBytes(32);
    const poolIdArray = Array.from(poolId);

    // Calculate timestamps
    const lockTime = now + template.joinWindowSeconds;
    const startTime = lockTime + template.lockBufferSeconds;
    const endTime = startTime + template.interval;

    console.log(`[Scheduler] Creating ${template.asset} pool...`);
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

      // Create pool in database
      const pool = await prisma.pool.create({
        data: {
          poolId: poolPda.toBase58(),
          asset: template.asset,
          interval: template.intervalKey,
          durationSeconds: template.interval,
          status: PoolStatus.UPCOMING,
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

      // Emit WebSocket event for new pool
      emitNewPool({
        id: pool.id,
        poolId: pool.poolId,
        asset: pool.asset,
        interval: pool.interval,
        durationSeconds: pool.durationSeconds,
        status: pool.status,
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
   * UPCOMING → JOINING (when deposit window opens)
   * JOINING → ACTIVE (at lock_time, capture strike price)
   */
  async processStatusTransitions(): Promise<void> {
    const now = new Date();

    // Find pools to transition UPCOMING → JOINING
    const poolsToJoin = await prisma.pool.findMany({
      where: {
        status: PoolStatus.UPCOMING,
        lockTime: { gt: now }, // Still time to join
      },
    });

    // Transition UPCOMING → JOINING
    if (poolsToJoin.length > 0) {
      await prisma.pool.updateMany({
        where: {
          id: { in: poolsToJoin.map(p => p.id) },
        },
        data: {
          status: PoolStatus.JOINING,
        },
      });

      // Emit WebSocket events for each pool
      for (const pool of poolsToJoin) {
        emitPoolStatus(pool.id, {
          id: pool.id,
          status: 'JOINING',
        });
        console.log(`[Scheduler] Pool ${pool.id} → JOINING`);
      }
    }

    // Transition JOINING → ACTIVE (at lock_time, capture strike price)
    const poolsToActivate = await prisma.pool.findMany({
      where: {
        status: PoolStatus.JOINING,
        lockTime: { lte: now },
      },
    });

    for (const pool of poolsToActivate) {
      await this.activatePool(pool.id, pool.asset);
    }
  }

  /**
   * Activate a pool: capture strike price and transition to ACTIVE
   */
  private async activatePool(poolId: string, asset: string): Promise<void> {
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
