import crypto from 'crypto';
import { PrismaClient, PoolStatus, Prisma } from '@prisma/client';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { PacificaProvider } from 'market-data';
import { getPoolPDA, getVaultPDA, buildInitializePoolIx } from 'solana-client';
import { PoolTemplate } from './config';
import { emitNewPool, ensurePriceStreams } from '../websocket';
import { getUsdcMint, derivePoolSeed, getConnection, rotateConnection } from '../utils/solana';
import { sendAndConfirm } from '../utils/onchain';
import { isIntervalCreationAllowed } from '../services/pool-creation/config';

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
          // Verify pool doesn't exist on-chain before deleting DB (prevents orphans)
          try {
            const seed = derivePoolSeed(pool.id);
            const [poolPda] = getPoolPDA(seed);
            const accountInfo = await getConnection().getAccountInfo(poolPda);
            if (accountInfo) {
              console.log(`[Scheduler] Skipping duplicate ${pool.id} - still on-chain, will expire naturally`);
              continue;
            }
          } catch {
            // RPC error - skip deletion to be safe
            continue;
          }
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
    // Admin per-interval toggle: skip creation (and its on-chain RPC) when this
    // interval is disabled. Existing pools still resolve/close.
    if (!(await isIntervalCreationAllowed(template.intervalKey))) {
      return null;
    }

    const duplicate = await this.deps.prisma.pool.findFirst({
      where: {
        asset: template.asset,
        interval: template.intervalKey,
        status: PoolStatus.JOINING,
        lockTime: { gt: new Date() },
      },
    });
    if (duplicate) {
      console.log(`[Scheduler] Skipping ${template.asset}/${template.intervalKey} - JOINING pool already exists`);
      return null;
    }

    const now = Math.floor(Date.now() / 1000);

    // Generate UUID first - this is the canonical pool identity
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
        // The init tx may have actually LANDED on-chain even though confirmation
        // threw (429 / timeout under RPC load). Rolling back the DB row in that
        // case orphans the pool (chain pool with no DB row) — the exact bug that
        // accumulated thousands of orphans. So verify on-chain FIRST: only roll
        // back when the pool truly does not exist; if it exists (or the RPC can't
        // tell), keep the DB row and treat it as created.
        let existsOnChain = true; // default: assume landed (don't risk orphaning)
        try {
          existsOnChain = (await getConnection().getAccountInfo(poolPda)) !== null;
        } catch { /* RPC unsure — keep the row to be safe */ }

        if (!existsOnChain) {
          await this.deps.prisma.priceSnapshot.deleteMany({ where: { poolId: pool.id } }).catch(e => console.warn('[Scheduler] rollback priceSnapshot failed:', e instanceof Error ? e.message : e));
          await this.deps.prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: pool.id } }).catch(e => console.warn('[Scheduler] rollback eventLog failed:', e instanceof Error ? e.message : e));
          await this.deps.prisma.pool.delete({ where: { id: pool.id } }).catch(e => console.warn('[Scheduler] rollback pool failed:', e instanceof Error ? e.message : e));
          console.warn(`[Scheduler] On-chain creation failed (pool not on-chain), rolled back DB row ${pool.id}`);
          throw chainError;
        }
        // Pool IS on-chain — confirmation just failed. Keep the DB row (no orphan)
        // and fall through so the rest of creation (snapshot, emit) proceeds.
        console.warn(`[Scheduler] init confirmation errored but pool ${pool.id} exists on-chain — keeping DB row to avoid orphan`);
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

      // Make sure the Pacifica WS price stream for this asset is running
      // so the price-history buffer fills regardless of whether any
      // client is currently on /pool/[id]. Ref-counted; no-op when the
      // stream is already active. Without this a 5m pool whose entire
      // life happens with no client connected would resolve via the
      // spot-fallback path.
      ensurePriceStreams([template.asset]);

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

    const signature = await sendAndConfirm(ix, this.deps.wallet, { label: 'initialize_pool', skipPreflight: true });
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
