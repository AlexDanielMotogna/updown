import crypto from 'crypto';
import { PrismaClient, PoolStatus, Prisma } from '@prisma/client';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { getPoolPDA, getVaultPDA, buildInitializePoolIx } from 'solana-client';
import { PoolTemplate } from './config';
import { emitNewPool } from '../websocket';
import { getUsdcMint, derivePoolSeed } from '../utils/solana';

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

    // Generate UUID first — this is the canonical pool identity
    const uuid = crypto.randomUUID();
    const seed = derivePoolSeed(uuid);

    const interval = template.interval;
    const lockTime = Math.floor(now / interval) * interval + interval;
    const startTime = lockTime;
    const endTime = lockTime + interval;

    console.log(`[Scheduler] Creating ${template.asset}/${template.intervalKey} pool...`);
    console.log(`[Scheduler]   Lock: ${new Date(lockTime * 1000).toISOString()}`);
    console.log(`[Scheduler]   Start: ${new Date(startTime * 1000).toISOString()}`);
    console.log(`[Scheduler]   End: ${new Date(endTime * 1000).toISOString()}`);

    try {
      const [poolPda] = getPoolPDA(seed);
      const [vaultPda] = getVaultPDA(seed);
      const usdcMint = getUsdcMint();

      // Send on-chain initializePool transaction
      // If this fails, we abort entirely (no DB insert). Scheduler retries next tick.
      await this.initializePoolOnChain(
        seed, template.asset,
        startTime, endTime, lockTime, usdcMint,
        poolPda, vaultPda,
      );

      const pool = await this.deps.prisma.pool.create({
        data: {
          id: uuid,
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
    seed: Buffer, asset: string,
    startTime: number, endTime: number, lockTime: number,
    usdcMint: PublicKey,
    poolPda: PublicKey, vaultPda: PublicKey,
  ): Promise<string> {
    console.log(`[Scheduler] Initializing on-chain pool:`);
    console.log(`[Scheduler]   Pool PDA: ${poolPda.toBase58()}`);
    console.log(`[Scheduler]   Vault PDA: ${vaultPda.toBase58()}`);
    console.log(`[Scheduler]   Asset: ${asset}`);
    console.log(`[Scheduler]   Times: lock=${lockTime}, start=${startTime}, end=${endTime}`);

    // Anchor requires lock_time < start_time (strict).
    // Our scheduler sets lockTime == startTime, so pass lockTime - 1 on-chain.
    const onChainLockTime = lockTime - 1;

    const ix = buildInitializePoolIx(
      poolPda,
      vaultPda,
      usdcMint,
      this.deps.wallet.publicKey,
      seed,
      asset,
      startTime,
      endTime,
      onChainLockTime,
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
      throw new Error(`initializePool tx failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[Scheduler] initializePool tx confirmed: ${signature}`);
    return signature;
  }

  private async logEvent(
    eventType: string, entityType: string, entityId: string, payload: Record<string, string>,
  ): Promise<void> {
    await this.deps.prisma.eventLog.create({
      data: { eventType, entityType, entityId, payload: payload as Prisma.InputJsonValue },
    });
  }
}
