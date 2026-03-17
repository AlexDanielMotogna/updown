import crypto from 'crypto';
import { PrismaClient, PoolStatus, Prisma } from '@prisma/client';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getPoolPDA, getVaultPDA } from 'solana-client';
import { PoolTemplate } from './config';
import { emitNewPool } from '../websocket';
import { getUsdcMint } from '../utils/solana';

export interface CreatorDeps {
  prisma: PrismaClient;
  connection: Connection;
  wallet: Keypair;
}

/**
 * Handles pool creation, deduplication, and successor spawning.
 */
export class PoolCreator {
  /** Per-template mutex to prevent concurrent pool creation races */
  private creationLocks = new Map<string, Promise<void>>();

  constructor(private deps: CreatorDeps) {}

  /**
   * Ensure exactly one JOINING pool exists for a given template.
   * Uses an in-process mutex + database check inside createPool for safety.
   */
  async ensureJoiningPool(template: PoolTemplate): Promise<void> {
    const key = `${template.asset}/${template.intervalKey}`;

    const pending = this.creationLocks.get(key);
    if (pending) return;

    const work = (async () => {
      const existing = await this.deps.prisma.pool.findFirst({
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
   * Remove duplicate JOINING pools per asset+interval.
   * Keeps the one with the latest lockTime, removes the rest.
   */
  async cleanupDuplicateJoiningPools(templates: PoolTemplate[]): Promise<void> {
    for (const template of templates) {
      const joiningPools = await this.deps.prisma.pool.findMany({
        where: {
          asset: template.asset,
          interval: template.intervalKey,
          status: PoolStatus.JOINING,
        },
        orderBy: { lockTime: 'desc' },
      });

      if (joiningPools.length <= 1) continue;

      const toDelete = joiningPools.slice(1);
      for (const pool of toDelete) {
        const betCount = await this.deps.prisma.bet.count({ where: { poolId: pool.id } });
        if (betCount === 0) {
          await this.deps.prisma.priceSnapshot.deleteMany({ where: { poolId: pool.id } });
          await this.deps.prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: pool.id } });
          await this.deps.prisma.pool.delete({ where: { id: pool.id } });
          console.log(`[Scheduler] Removed duplicate JOINING pool ${pool.id} (${pool.asset}/${pool.interval})`);
        }
      }
    }
  }

  /**
   * Create a new pool based on template.
   * Includes a final database-level dedup check to prevent duplicates.
   */
  async createPool(template: PoolTemplate): Promise<string | null> {
    const duplicate = await this.deps.prisma.pool.findFirst({
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

    const interval = template.interval;
    const lockTime = Math.floor(now / interval) * interval + interval;
    const startTime = lockTime;
    const endTime = lockTime + interval;

    console.log(`[Scheduler] Creating ${template.asset}/${template.intervalKey} pool...`);
    console.log(`[Scheduler]   Lock: ${new Date(lockTime * 1000).toISOString()}`);
    console.log(`[Scheduler]   Start: ${new Date(startTime * 1000).toISOString()}`);
    console.log(`[Scheduler]   End: ${new Date(endTime * 1000).toISOString()}`);

    try {
      const [poolPda] = getPoolPDA(poolId);
      const [vaultPda] = getVaultPDA(poolId);

      const usdcMint = getUsdcMint();

      if (process.env.SOLANA_RPC_URL) {
        try {
          await this.initializePoolOnChain(
            Array.from(poolId), template.asset,
            startTime, endTime, lockTime, usdcMint,
          );
        } catch (error) {
          console.error('[Scheduler] Failed to create pool on-chain:', error);
        }
      }

      const pool = await this.deps.prisma.pool.create({
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

      await this.logEvent('POOL_CREATED', 'pool', pool.id, {
        poolId: poolPda.toBase58(),
        asset: template.asset,
        lockTime: lockTime.toString(),
        startTime: startTime.toString(),
        endTime: endTime.toString(),
      });

      console.log(`[Scheduler] Pool created: ${pool.id} (${poolPda.toBase58()})`);

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

  private async initializePoolOnChain(
    poolId: number[], asset: string,
    startTime: number, endTime: number, lockTime: number,
    usdcMint: PublicKey,
  ): Promise<string> {
    const [poolPda] = getPoolPDA(Uint8Array.from(poolId));
    const [vaultPda] = getVaultPDA(Uint8Array.from(poolId));
    console.log(`[Scheduler] Would initialize on-chain pool:`);
    console.log(`[Scheduler]   Pool PDA: ${poolPda.toBase58()}`);
    console.log(`[Scheduler]   Vault PDA: ${vaultPda.toBase58()}`);
    console.log(`[Scheduler]   Asset: ${asset}`);
    console.log(`[Scheduler]   Times: lock=${lockTime}, start=${startTime}, end=${endTime}`);
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
