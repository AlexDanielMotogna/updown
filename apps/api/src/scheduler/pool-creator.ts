import crypto from 'crypto';
import { PrismaClient, PoolStatus, Prisma } from '@prisma/client';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { PacificaProvider } from 'market-data';
import { getPoolPDA, getVaultPDA, buildInitializePoolIx } from 'solana-client';
import { PoolTemplate } from './config';
import { emitNewPool } from '../websocket';
import { getUsdcMint, derivePoolSeed, getConnection, rotateConnection } from '../utils/solana';

export interface CreatorDeps {
  prisma: PrismaClient;
  connection: Connection;
  wallet: Keypair;
  priceProvider: PacificaProvider;
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
      // Only count JOINING pools whose lockTime hasn't passed yet.
      // Pools past lockTime are about to be resolved and don't count as active.
      const existing = await this.deps.prisma.pool.findFirst({
        where: {
          asset: template.asset,
          interval: template.intervalKey,
          status: PoolStatus.JOINING,
          lockTime: { gt: new Date() },
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
          await this.deps.prisma.pool.deleteMany({ where: { id: pool.id } });
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
        lockTime: { gt: new Date() },
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
    // New timing: pool starts now, resolves after interval, betting open until 1s before end
    const startTime = now;
    const endTime = startTime + interval;
    const lockTime = endTime - 1;

    console.log(`[Scheduler] Creating ${template.asset}/${template.intervalKey} pool...`);
    console.log(`[Scheduler]   Start: ${new Date(startTime * 1000).toISOString()}`);
    console.log(`[Scheduler]   Lock: ${new Date(lockTime * 1000).toISOString()}`);
    console.log(`[Scheduler]   End: ${new Date(endTime * 1000).toISOString()}`);

    try {
      // Capture strike price at creation time
      const priceTick = await this.deps.priceProvider.getSpotPrice(template.asset);
      const strikePrice = priceTick.price;

      console.log(`[Scheduler]   Strike price: ${strikePrice}`);

      const [poolPda] = getPoolPDA(seed);
      const [vaultPda] = getVaultPDA(seed);
      const usdcMint = getUsdcMint();

      // ── DB-first: insert DB row BEFORE on-chain to prevent orphans ──
      // If on-chain fails, we roll back the DB row. If the server crashes
      // after DB insert but before on-chain, we get a harmless DB-only row
      // (cleaned up on next startup) instead of an unrecoverable chain orphan.
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
          strikePrice,
          totalUp: BigInt(0),
          totalDown: BigInt(0),
        },
      });

      try {
        await this.initializePoolOnChain(
          seed, template.asset,
          startTime, endTime, lockTime, strikePrice,
          usdcMint, poolPda, vaultPda,
        );
      } catch (chainError) {
        // On-chain failed — roll back DB to prevent stale DB-only pool
        await this.deps.prisma.priceSnapshot.deleteMany({ where: { poolId: pool.id } }).catch(() => {});
        await this.deps.prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: pool.id } }).catch(() => {});
        await this.deps.prisma.pool.delete({ where: { id: pool.id } }).catch(() => {});
        console.warn(`[Scheduler] On-chain creation failed, rolled back DB row ${pool.id}`);
        throw chainError;
      }

      // Create STRIKE PriceSnapshot at creation time
      await this.deps.prisma.priceSnapshot.create({
        data: {
          poolId: pool.id,
          type: 'STRIKE',
          price: strikePrice,
          timestamp: priceTick.timestamp,
          source: priceTick.source,
          rawHash: priceTick.rawHash || '',
        },
      });

      await this.logEvent('POOL_CREATED', 'pool', pool.id, {
        poolId: poolPda.toBase58(),
        asset: template.asset,
        strikePrice: strikePrice.toString(),
        lockTime: lockTime.toString(),
        startTime: startTime.toString(),
        endTime: endTime.toString(),
      });

      console.log(`[Scheduler] Pool created: ${pool.id} (${poolPda.toBase58()}) strike=${strikePrice}`);

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
        strikePrice: strikePrice.toString(),
        totalUp: '0',
        totalDown: '0',
        totalPool: '0',
      });

      return pool.id;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('Server responded') ||
          msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
        rotateConnection();
      }
      console.error(`[Scheduler] Failed to create pool:`, error);
      return null;
    }
  }

  private async initializePoolOnChain(
    seed: Buffer, asset: string,
    startTime: number, endTime: number, lockTime: number,
    strikePrice: bigint,
    usdcMint: PublicKey,
    poolPda: PublicKey, vaultPda: PublicKey,
  ): Promise<string> {
    console.log(`[Scheduler] Initializing on-chain pool:`);
    console.log(`[Scheduler]   Pool PDA: ${poolPda.toBase58()}`);
    console.log(`[Scheduler]   Vault PDA: ${vaultPda.toBase58()}`);
    console.log(`[Scheduler]   Asset: ${asset}`);
    console.log(`[Scheduler]   Times: lock=${lockTime}, start=${startTime}, end=${endTime}`);
    console.log(`[Scheduler]   Strike: ${strikePrice}`);

    const ix = buildInitializePoolIx(
      poolPda,
      vaultPda,
      usdcMint,
      this.deps.wallet.publicKey,
      seed,
      asset,
      startTime,
      endTime,
      lockTime,
      strikePrice,
    );

    const transaction = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await getConnection().getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.deps.wallet.publicKey;
    transaction.sign(this.deps.wallet);

    const signature = await getConnection().sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
    });

    const confirmation = await getConnection().confirmTransaction(
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
