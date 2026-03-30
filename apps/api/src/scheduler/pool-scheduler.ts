import cron from 'node-cron';
import { PrismaClient, PoolStatus } from '@prisma/client';
import { Keypair } from '@solana/web3.js';
import { PacificaProvider } from 'market-data';
import { getSchedulerConfig } from './config';
import { PoolCreator } from './pool-creator';
import { PoolResolver } from './pool-resolver';
import { getConnection, getAuthorityKeypair } from '../utils/solana';

const prisma = new PrismaClient();

/**
 * Pool Scheduler Service
 * Orchestrates the full lifecycle of parimutuel pools by composing
 * PoolCreator (creation + dedup) and PoolResolver (resolution + refunds).
 */
export interface JobHealth {
  name: string;
  schedule: string;
  lastRunAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  runCount: number;
  errorCount: number;
}

export class PoolScheduler {
  private priceProvider: PacificaProvider;
  private wallet: Keypair;
  private jobs: cron.ScheduledTask[] = [];
  private isRunning = false;
  private jobHealthMap = new Map<string, JobHealth>();

  private creator: PoolCreator;
  private resolver: PoolResolver;

  constructor() {
    this.priceProvider = new PacificaProvider();

    this.wallet = getAuthorityKeypair();

    const connection = getConnection();
    const deps = { prisma, connection, wallet: this.wallet, priceProvider: this.priceProvider };
    this.creator = new PoolCreator(deps);
    this.resolver = new PoolResolver(deps);
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
      const jobName = `guard:${template.asset}/${template.intervalKey}`;
      const job = cron.schedule(template.cronExpression, () => {
        this.runTracked(jobName, () => this.creator.ensureJoiningPool(template));
      });
      this.jobs.push(job);
      this.initJobHealth(jobName, template.cronExpression);
      console.log(`[Scheduler] Guard for ${template.asset}/${template.intervalKey}: ${template.cronExpression}`);
    }

    // Status transitions every 10 seconds (reduces RPC pressure across instances)
    const transitionJob = cron.schedule('*/10 * * * * *', () => {
      this.runTracked('transitions', () => Promise.all([
        this.processStatusTransitions(),
        this.resolver.processResolutions(),
        this.resolver.processClaimableTransitions(),
        this.resolver.processPoolClosures(),
      ]));
    });
    this.jobs.push(transitionJob);
    this.initJobHealth('transitions', '*/10 * * * * *');
    console.log('[Scheduler] Scheduled transition & resolution job: every 10 seconds');

    // Periodic dedup cleanup (every 30 seconds)
    const dedupJob = cron.schedule('*/30 * * * * *', () => {
      this.runTracked('dedup-cleanup', () => this.creator.cleanupDuplicateJoiningPools(config.templates));
    });
    this.jobs.push(dedupJob);
    this.initJobHealth('dedup-cleanup', '*/30 * * * * *');

    // Cleanup empty pools (every hour at :30)
    const cleanupJob = cron.schedule('30 * * * *', () => {
      this.runTracked('empty-pool-cleanup', () => this.resolver.cleanupEmptyPools());
    });
    this.jobs.push(cleanupJob);
    this.initJobHealth('empty-pool-cleanup', '30 * * * *');
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
   * Create successor pools when current pool's lockTime passes.
   * No more ACTIVE transition — pools go JOINING → RESOLVED directly.
   */
  async processStatusTransitions(): Promise<void> {
    const now = new Date();
    const lockedPools = await prisma.pool.findMany({
      where: {
        status: PoolStatus.JOINING,
        lockTime: { lte: now },
      },
      select: { id: true, asset: true, interval: true },
    });

    const config = getSchedulerConfig();
    for (const pool of lockedPools) {
      if (!pool.interval) continue;
      const template = config.templates.find(
        (t) => t.asset === pool.asset && t.intervalKey === pool.interval
      );
      if (template) {
        await this.creator.ensureJoiningPool(template).catch((err) =>
          console.error(`[Scheduler] Failed to create successor for ${pool.asset}/${pool.interval}:`, err)
        );
      }
    }
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

  private initJobHealth(name: string, schedule: string): void {
    this.jobHealthMap.set(name, {
      name,
      schedule,
      lastRunAt: null,
      lastErrorAt: null,
      lastError: null,
      runCount: 0,
      errorCount: 0,
    });
  }

  private async runTracked(name: string, fn: () => Promise<unknown>): Promise<void> {
    const health = this.jobHealthMap.get(name);
    try {
      await fn();
      if (health) {
        health.lastRunAt = new Date();
        health.runCount++;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Scheduler] ${name} error:`, msg);
      if (health) {
        health.lastRunAt = new Date();
        health.runCount++;
        health.lastErrorAt = new Date();
        health.lastError = msg;
        health.errorCount++;
      }
    }
  }

  /**
   * Get health status for all cron jobs
   */
  getJobHealth(): JobHealth[] {
    return Array.from(this.jobHealthMap.values());
  }

  /**
   * Get the resolver instance (for admin actions)
   */
  getResolver(): PoolResolver {
    return this.resolver;
  }

  /**
   * Get the creator instance (for admin actions)
   */
  getCreator(): PoolCreator {
    return this.creator;
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
