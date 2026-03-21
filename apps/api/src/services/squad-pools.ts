import crypto from 'crypto';
import { PoolStatus } from '@prisma/client';
import { Transaction } from '@solana/web3.js';
import { PacificaProvider } from 'market-data';
import { getPoolPDA, getVaultPDA, buildInitializePoolIx } from 'solana-client';
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
