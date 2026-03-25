import crypto from 'crypto';
import { PoolStatus } from '@prisma/client';
import { PublicKey, Transaction } from '@solana/web3.js';
import { PacificaProvider } from 'market-data';
import { getPoolPDA, getVaultPDA, buildInitializePoolIx, buildResolveIx, buildClosePoolIx } from 'solana-client';
import { prisma } from '../db';
import { getUsdcMint, getAuthorityKeypair, derivePoolSeed, getConnection, rotateConnection } from '../utils/solana';
import { emitNewPool } from '../websocket';

// Lazy singleton for price provider
let _priceProvider: PacificaProvider | null = null;
function getPriceProvider(): PacificaProvider {
  if (!_priceProvider) {
    _priceProvider = new PacificaProvider();
  }
  return _priceProvider;
}

const VALID_ASSETS = ['BTC', 'ETH', 'SOL'];
const MIN_DURATION = 60;    // 1 minute
const MAX_DURATION = 86400; // 24 hours

/**
 * Create a squad pool — same on-chain flow as scheduler PoolCreator.createPool(),
 * but with custom asset/duration and squad association.
 */
export async function createSquadPool(params: {
  wallet: string;
  squadId: string;
  asset: string;
  durationSeconds: number;
  maxBettors?: number;
}): Promise<string> {
  const { wallet, squadId, asset, durationSeconds, maxBettors } = params;

  // Validate asset
  const normalizedAsset = asset.toUpperCase();
  if (!VALID_ASSETS.includes(normalizedAsset)) {
    throw new Error('INVALID_ASSET');
  }

  // Validate duration
  if (durationSeconds < MIN_DURATION || durationSeconds > MAX_DURATION) {
    throw new Error('INVALID_DURATION');
  }

  // Validate squad exists and wallet is a member
  const member = await prisma.squadMember.findUnique({
    where: {
      squadId_walletAddress: { squadId, walletAddress: wallet },
    },
  });
  if (!member) {
    throw new Error('NOT_MEMBER');
  }

  // Generate UUID — canonical pool identity
  const uuid = crypto.randomUUID();
  const seed = derivePoolSeed(uuid);

  const now = Math.floor(Date.now() / 1000);
  const startTime = now;
  const endTime = startTime + durationSeconds;
  const lockTime = endTime - 1;

  // Format interval key for display
  const intervalKey = durationSeconds >= 3600
    ? `${Math.floor(durationSeconds / 3600)}h`
    : `${Math.floor(durationSeconds / 60)}m`;

  try {
    // Capture strike price
    const priceProvider = getPriceProvider();
    const priceTick = await priceProvider.getSpotPrice(normalizedAsset);
    const strikePrice = priceTick.price;

    const [poolPda] = getPoolPDA(seed);
    const [vaultPda] = getVaultPDA(seed);
    const usdcMint = getUsdcMint();
    const authority = getAuthorityKeypair();

    // Initialize pool on-chain
    const ix = buildInitializePoolIx(
      poolPda, vaultPda, usdcMint, authority.publicKey,
      seed, normalizedAsset, startTime, endTime, lockTime, strikePrice,
    );

    const transaction = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await getConnection().getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = authority.publicKey;
    transaction.sign(authority);

    const signature = await getConnection().sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
    });

    const confirmation = await getConnection().confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    if (confirmation.value.err) {
      throw new Error(`initializePool tx failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[SquadPool] On-chain pool initialized: ${signature}`);

    // Create DB record
    const pool = await prisma.pool.create({
      data: {
        id: uuid,
        poolId: poolPda.toBase58(),
        asset: normalizedAsset,
        interval: intervalKey,
        durationSeconds,
        status: PoolStatus.JOINING,
        lockTime: new Date(lockTime * 1000),
        startTime: new Date(startTime * 1000),
        endTime: new Date(endTime * 1000),
        strikePrice,
        totalUp: BigInt(0),
        totalDown: BigInt(0),
        squadId,
        maxBettors: maxBettors ?? null,
      },
    });

    // Create STRIKE price snapshot
    await prisma.priceSnapshot.create({
      data: {
        poolId: pool.id,
        type: 'STRIKE',
        price: strikePrice,
        timestamp: priceTick.timestamp,
        source: priceTick.source,
        rawHash: priceTick.rawHash || '',
      },
    });

    await prisma.eventLog.create({
      data: {
        eventType: 'SQUAD_POOL_CREATED',
        entityType: 'pool',
        entityId: pool.id,
        payload: {
          squadId,
          creatorWallet: wallet,
          asset: normalizedAsset,
          strikePrice: strikePrice.toString(),
          durationSeconds,
          maxBettors: maxBettors ?? null,
        },
      },
    });

    console.log(`[SquadPool] Pool created: ${pool.id} for squad ${squadId}`);

    // Emit for real-time — goes to squad room only (handled by route)
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
      squadId,
    });

    return pool.id;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('Server responded') ||
        msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
      rotateConnection();
    }
    throw error;
  }
}

// ── User-pays-rent flow (2 steps) ──────────────────────────────────────────

const MIN_SOL_BALANCE = 10_000_000; // 0.01 SOL in lamports

/**
 * Step 1: Prepare a squad pool tx where the USER is feePayer.
 * Authority partial-signs. Returns serialized tx for user to co-sign.
 */
export async function prepareSquadPool(params: {
  wallet: string;
  squadId: string;
  asset: string;
  durationSeconds: number;
  maxBettors?: number;
}): Promise<{
  transaction: string;
  poolId: string;
  strikePrice: string;
  asset: string;
  intervalKey: string;
  startTime: number;
  endTime: number;
  lockTime: number;
}> {
  const { wallet, squadId, asset, durationSeconds } = params;

  const normalizedAsset = asset.toUpperCase();
  if (!VALID_ASSETS.includes(normalizedAsset)) throw new Error('INVALID_ASSET');
  if (durationSeconds < MIN_DURATION || durationSeconds > MAX_DURATION) throw new Error('INVALID_DURATION');

  const member = await prisma.squadMember.findUnique({
    where: { squadId_walletAddress: { squadId, walletAddress: wallet } },
  });
  if (!member) throw new Error('NOT_MEMBER');

  // Check user SOL balance
  const connection = getConnection();
  const userPubkey = new PublicKey(wallet);
  const balance = await connection.getBalance(userPubkey);
  if (balance < MIN_SOL_BALANCE) {
    throw new Error('INSUFFICIENT_SOL');
  }

  const uuid = crypto.randomUUID();
  const seed = derivePoolSeed(uuid);
  const now = Math.floor(Date.now() / 1000);
  const startTime = now;
  const endTime = startTime + durationSeconds;
  const lockTime = endTime - 1;
  const intervalKey = durationSeconds >= 3600
    ? `${Math.floor(durationSeconds / 3600)}h`
    : `${Math.floor(durationSeconds / 60)}m`;

  const priceProvider = getPriceProvider();
  const priceTick = await priceProvider.getSpotPrice(normalizedAsset);
  const strikePrice = priceTick.price;

  const [poolPda] = getPoolPDA(seed);
  const [vaultPda] = getVaultPDA(seed);
  const usdcMint = getUsdcMint();
  const authority = getAuthorityKeypair();

  const ix = buildInitializePoolIx(
    poolPda, vaultPda, usdcMint, authority.publicKey,
    seed, normalizedAsset, startTime, endTime, lockTime, strikePrice,
  );

  const tx = new Transaction().add(ix);
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = userPubkey; // User pays rent
  tx.partialSign(authority); // Authority signs as program signer

  const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');

  return {
    transaction: serialized,
    poolId: uuid,
    strikePrice: strikePrice.toString(),
    asset: normalizedAsset,
    intervalKey,
    startTime,
    endTime,
    lockTime,
  };
}

/**
 * Step 2: Confirm squad pool after user signed + sent the tx.
 * Creates DB record.
 */
export async function confirmSquadPool(params: {
  wallet: string;
  squadId: string;
  poolId: string;
  txSignature: string;
  asset: string;
  intervalKey: string;
  durationSeconds: number;
  startTime: number;
  endTime: number;
  lockTime: number;
  strikePrice: string;
  maxBettors?: number;
}): Promise<string> {
  const {
    wallet, squadId, poolId, txSignature, asset, intervalKey,
    durationSeconds, startTime, endTime, lockTime, strikePrice, maxBettors,
  } = params;

  // Verify tx confirmed on-chain
  const connection = getConnection();
  const status = await connection.getSignatureStatus(txSignature, { searchTransactionHistory: true });
  if (!status?.value?.confirmationStatus || status.value.err) {
    throw new Error('TX_NOT_CONFIRMED');
  }

  const seed = derivePoolSeed(poolId);
  const [poolPda] = getPoolPDA(seed);

  const pool = await prisma.pool.create({
    data: {
      id: poolId,
      poolId: poolPda.toBase58(),
      asset,
      interval: intervalKey,
      durationSeconds,
      status: PoolStatus.JOINING,
      lockTime: new Date(lockTime * 1000),
      startTime: new Date(startTime * 1000),
      endTime: new Date(endTime * 1000),
      strikePrice: BigInt(strikePrice),
      totalUp: BigInt(0),
      totalDown: BigInt(0),
      squadId,
      maxBettors: maxBettors ?? null,
    },
  });

  await prisma.priceSnapshot.create({
    data: {
      poolId: pool.id,
      type: 'STRIKE',
      price: BigInt(strikePrice),
      timestamp: new Date(),
      source: 'pacifica',
      rawHash: '',
    },
  });

  await prisma.eventLog.create({
    data: {
      eventType: 'SQUAD_POOL_CREATED',
      entityType: 'pool',
      entityId: pool.id,
      payload: { squadId, creatorWallet: wallet, asset, strikePrice, durationSeconds, maxBettors: maxBettors ?? null },
    },
  });

  emitNewPool({
    id: pool.id, poolId: pool.poolId, asset, interval: intervalKey,
    durationSeconds, status: 'JOINING',
    startTime: pool.startTime.toISOString(),
    endTime: pool.endTime.toISOString(),
    lockTime: pool.lockTime.toISOString(),
    strikePrice, totalUp: '0', totalDown: '0', totalPool: '0', squadId,
  });

  console.log(`[SquadPool] Pool confirmed: ${pool.id} (user-paid rent, tx: ${txSignature.slice(0, 20)}...)`);
  return pool.id;
}

/**
 * Cancel a squad pool — creator can cancel if no bets placed.
 * Resolves on-chain, closes pool, reclaims rent to creator.
 */
export async function cancelSquadPool(params: {
  wallet: string;
  squadId: string;
  poolId: string;
}): Promise<void> {
  const { wallet, squadId, poolId } = params;

  const pool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } });
  if (pool.squadId !== squadId) throw new Error('WRONG_SQUAD');

  // Check creator
  const event = await prisma.eventLog.findFirst({
    where: { entityId: poolId, eventType: 'SQUAD_POOL_CREATED' },
  });
  const creator = (event?.payload as any)?.creatorWallet;
  if (creator !== wallet) throw new Error('NOT_CREATOR');

  // Check no bets
  const betCount = await prisma.bet.count({ where: { poolId } });
  if (betCount > 0) throw new Error('HAS_BETS');

  const connection = getConnection();
  const authority = getAuthorityKeypair();
  const seed = derivePoolSeed(poolId);
  const [poolPda] = getPoolPDA(seed);
  const [vaultPda] = getVaultPDA(seed);

  // Resolve on-chain (synthetic — no real winner)
  const resolveIx = buildResolveIx(poolPda, authority.publicKey, BigInt(1000), BigInt(1000));
  const resolveTx = new Transaction().add(resolveIx);
  const { blockhash: rb, lastValidBlockHeight: rvbh } = await connection.getLatestBlockhash();
  resolveTx.recentBlockhash = rb;
  resolveTx.feePayer = authority.publicKey;
  resolveTx.sign(authority);
  const resolveSig = await connection.sendRawTransaction(resolveTx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  await connection.confirmTransaction({ signature: resolveSig, blockhash: rb, lastValidBlockHeight: rvbh }, 'confirmed');

  // Close pool — rent goes back to original feePayer (the creator)
  const closeIx = buildClosePoolIx(poolPda, vaultPda, authority.publicKey);
  const closeTx = new Transaction().add(closeIx);
  const { blockhash: cb, lastValidBlockHeight: cvbh } = await connection.getLatestBlockhash();
  closeTx.recentBlockhash = cb;
  closeTx.feePayer = authority.publicKey;
  closeTx.sign(authority);
  const closeSig = await connection.sendRawTransaction(closeTx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  await connection.confirmTransaction({ signature: closeSig, blockhash: cb, lastValidBlockHeight: cvbh }, 'confirmed');

  // Clean DB
  await prisma.priceSnapshot.deleteMany({ where: { poolId } });
  await prisma.eventLog.deleteMany({ where: { entityType: 'pool', entityId: poolId } });
  await prisma.pool.delete({ where: { id: poolId } });

  console.log(`[SquadPool] Pool ${poolId} cancelled by creator ${wallet.slice(0, 8)}`);
}
