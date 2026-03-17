import cron from 'node-cron';
import { PrismaClient, PoolStatus } from '@prisma/client';
import { Keypair } from '@solana/web3.js';
import { PacificaProvider } from 'market-data';
import { getSchedulerConfig } from './config';
import { emitPoolStatus } from '../websocket';
import { PoolCreator } from './pool-creator';
import { PoolResolver } from './pool-resolver';
import { getConnection, getAuthorityKeypair } from '../utils/solana';

const prisma = new PrismaClient();

/**
 * Pool Scheduler Service
 * Orchestrates the full lifecycle of parimutuel pools by composing
 * PoolCreator (creation + dedup) and PoolResolver (resolution + refunds).
 */
export class PoolScheduler {
  private priceProvider: PacificaProvider;
  private wallet: Keypair;
  private jobs: cron.ScheduledTask[] = [];
  private isRunning = false;

  private creator: PoolCreator;
  private resolver: PoolResolver;

  constructor() {
    this.priceProvider = new PacificaProvider();

    try {
      this.wallet = getAuthorityKeypair();
    } catch {
      console.warn('[Scheduler] No AUTHORITY_SECRET_KEY or AUTHORITY_KEYPAIR_PATH found, using random keypair');
      this.wallet = Keypair.generate();
    }

    const connection = getConnection();
    const deps = { prisma, connection, wallet: this.wallet };
    this.creator = new PoolCreator(deps);
    this.resolver = new PoolResolver({ ...deps, priceProvider: this.priceProvider });
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

    const healthy = await this.priceProvider.isHealthy();
    if (!healthy) {
      console.error('[Scheduler] Price provider is not healthy');
      throw new Error('Price provider health check failed');
    }

    // Startup: clean up duplicates + bootstrap JOINING pools
    await this.creator.cleanupDuplicateJoiningPools(config.templates);
    for (const template of config.templates) {
      await this.creator.ensureJoiningPool(template);
    }

    // Cron: safety-net guard per template
    for (const template of config.templates) {
      const job = cron.schedule(template.cronExpression, async () => {
        await this.creator.ensureJoiningPool(template);
      });
      this.jobs.push(job);
      console.log(`[Scheduler] Guard for ${template.asset}/${template.intervalKey}: ${template.cronExpression}`);
    }

    // Status transitions every 2 seconds
    const transitionJob = cron.schedule('*/2 * * * * *', async () => {
      await Promise.all([
        this.processStatusTransitions(),
        this.resolver.processResolutions(),
        this.resolver.processClaimableTransitions(),
      ]);
    });
    this.jobs.push(transitionJob);
    console.log('[Scheduler] Scheduled transition & resolution job: every 2 seconds');

    // Periodic dedup cleanup (every 30 seconds)
    const dedupJob = cron.schedule('*/30 * * * * *', async () => {
      await this.creator.cleanupDuplicateJoiningPools(config.templates);
    });
    this.jobs.push(dedupJob);

    // Cleanup empty pools (every hour at :30)
    const cleanupJob = cron.schedule('30 * * * *', async () => {
      await this.resolver.cleanupEmptyPools();
    });
    this.jobs.push(cleanupJob);
    console.log('[Scheduler] Scheduled cleanup jobs');

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
   * Process JOINING → ACTIVE transitions (at lock_time, capture strike price).
   */
  async processStatusTransitions(): Promise<void> {
    const now = new Date();
    const poolsToActivate = await prisma.pool.findMany({
      where: {
        status: PoolStatus.JOINING,
        lockTime: { lte: now },
      },
    });

    await Promise.all(
      poolsToActivate.map((pool) => this.activatePool(pool.id, pool.asset, pool.interval))
    );
  }

  /**
   * Activate a pool: capture strike price, transition to ACTIVE,
   * then immediately create the successor JOINING pool.
   */
  private async activatePool(poolId: string, asset: string, interval: string | null): Promise<void> {
    const claimed = await prisma.pool.updateMany({
      where: { id: poolId, status: PoolStatus.JOINING },
      data: { status: PoolStatus.ACTIVE },
    });
    if (claimed.count === 0) return;

    // Kick off successor creation in parallel
    let successorPromise: Promise<void> | null = null;
    if (interval) {
      const config = getSchedulerConfig();
      const template = config.templates.find(
        (t) => t.asset === asset && t.intervalKey === interval
      );
      if (template) {
        successorPromise = this.creator.ensureJoiningPool(template).catch((err) =>
          console.error(`[Scheduler] Failed to create successor for ${asset}/${interval}:`, err)
        );
      }
    }

    try {
      const priceTick = await this.priceProvider.getSpotPrice(asset);
      const strikePrice = priceTick.price;

      await Promise.all([
        prisma.pool.update({
          where: { id: poolId },
          data: { strikePrice },
        }),
        prisma.priceSnapshot.create({
          data: {
            poolId,
            type: 'STRIKE',
            price: strikePrice,
            timestamp: priceTick.timestamp,
            source: priceTick.source,
            rawHash: priceTick.rawHash || '',
          },
        }),
        prisma.eventLog.create({
          data: {
            eventType: 'POOL_ACTIVATED',
            entityType: 'pool',
            entityId: poolId,
            payload: {
              strikePrice: strikePrice.toString(),
              source: priceTick.source,
            },
          },
        }),
      ]);

      emitPoolStatus(poolId, {
        id: poolId,
        status: 'ACTIVE',
        strikePrice: strikePrice.toString(),
      });

      console.log(`[Scheduler] Pool ${poolId} → ACTIVE with strike price: ${strikePrice}`);
    } catch (error) {
      console.error(`[Scheduler] Failed to activate pool ${poolId}:`, error);
    }

    if (successorPromise) await successorPromise;
  }

  /**
   * Delete resolved/claimable pools that had zero participants.
   */
  async cleanupEmptyPools(): Promise<number> {
    return this.resolver.cleanupEmptyPools();
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
    return this.creator.createPool({
      asset,
      intervalKey,
      interval: intervalSeconds,
      cronExpression: '',
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
