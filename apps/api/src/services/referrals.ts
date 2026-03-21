import { createHash } from 'crypto';
import { PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';
import { prisma } from '../db';
import { getConnection, getUsdcMint, getAuthorityKeypair } from '../utils/solana';
import { getLevelForXp, getXpForLevel } from '../utils/levels';
import { emitUserReward } from '../websocket';

const COMMISSION_BPS = 100; // 1% of bet amount
const REFERRAL_XP_REWARD = 500n;
const REFERRAL_COINS_REWARD = 5000n; // 50 UP in base units (100 base = 1 UP display)

/**
 * Generate a deterministic referral code from a wallet address.
 * SHA256(wallet + salt) truncated to 10 hex chars.
 */
export function generateReferralCode(walletAddress: string): string {
  const salt = process.env.REFERRAL_SALT || 'updown-referrals-v1';
  return createHash('sha256')
    .update(walletAddress + salt)
    .digest('hex')
    .slice(0, 10);
}

/**
 * Ensure a user has a referral code. Generates and persists if missing.
 */
export async function ensureReferralCode(walletAddress: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { walletAddress },
    select: { referralCode: true },
  });

  if (user?.referralCode) return user.referralCode;

  const code = generateReferralCode(walletAddress);
  await prisma.user.update({
    where: { walletAddress },
    data: { referralCode: code },
  });
  return code;
}

/**
 * Look up referrer wallet by referral code. Returns null if not found.
 */
export async function resolveReferralCode(code: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { referralCode: code },
    select: { walletAddress: true },
  });
  return user?.walletAddress ?? null;
}

/**
 * Accept a referral: link the referred user to the referrer.
 * Validates: no self-referral, no existing referrer, referrer exists.
 */
export async function acceptReferral(
  referredWallet: string,
  referralCode: string,
): Promise<{ success: boolean; error?: string }> {
  const referrer = await prisma.user.findFirst({
    where: { referralCode: referralCode },
    select: { walletAddress: true },
  });

  if (!referrer) return { success: false, error: 'Invalid referral code' };
  if (referrer.walletAddress === referredWallet) {
    return { success: false, error: 'Cannot refer yourself' };
  }

  const referred = await prisma.user.findUnique({
    where: { walletAddress: referredWallet },
    select: { referredBy: true },
  });

  if (!referred) return { success: false, error: 'User not found' };
  if (referred.referredBy) return { success: false, error: 'Already has a referrer' };

  await prisma.$transaction(async (tx) => {
    await tx.referral.create({
      data: {
        referrerWallet: referrer.walletAddress,
        referredWallet,
      },
    });
    await tx.user.update({
      where: { walletAddress: referredWallet },
      data: { referredBy: referrer.walletAddress },
    });

    // Award XP + Coins to referrer
    const referrerUser = await tx.user.findUnique({
      where: { walletAddress: referrer.walletAddress },
    });
    if (referrerUser) {
      const newTotalXp = referrerUser.totalXp + REFERRAL_XP_REWARD;
      const newLevel = getLevelForXp(newTotalXp);
      const didLevelUp = newLevel > referrerUser.level;

      await tx.user.update({
        where: { walletAddress: referrer.walletAddress },
        data: {
          totalXp: { increment: REFERRAL_XP_REWARD },
          level: newLevel,
          coinsBalance: { increment: REFERRAL_COINS_REWARD },
          coinsLifetime: { increment: REFERRAL_COINS_REWARD },
        },
      });

      await tx.rewardLog.create({
        data: {
          walletAddress: referrer.walletAddress,
          rewardType: 'XP',
          reason: 'REFERRAL_ACCEPTED',
          amount: REFERRAL_XP_REWARD,
          metadata: { referredWallet },
        },
      });

      await tx.rewardLog.create({
        data: {
          walletAddress: referrer.walletAddress,
          rewardType: 'COINS',
          reason: 'REFERRAL_ACCEPTED',
          amount: REFERRAL_COINS_REWARD,
          metadata: { referredWallet },
        },
      });

      if (didLevelUp) {
        await tx.rewardLog.create({
          data: {
            walletAddress: referrer.walletAddress,
            rewardType: 'XP',
            reason: 'LEVEL_UP',
            amount: 0n,
            metadata: { oldLevel: referrerUser.level, newLevel, trigger: 'referral' },
          },
        });
      }

      // Emit real-time notification to referrer
      emitUserReward(referrer.walletAddress, {
        xp: Number(REFERRAL_XP_REWARD),
        coins: Number(REFERRAL_COINS_REWARD),
        level: newLevel,
        levelUp: didLevelUp,
        totalXp: Number(newTotalXp),
        xpToNextLevel: Number(getXpForLevel(newLevel + 1) - newTotalXp),
        reason: 'referral',
      });
    }
  });

  return { success: true };
}

/**
 * Record referral commissions for all referred bets in a resolved pool.
 * Commission = 1% of bet amount, regardless of win/loss.
 * Called at pool resolution (not refund). Fire-and-forget.
 */
export async function recordReferralCommissions(
  poolId: string,
  bets: Array<{ id: string; walletAddress: string; amount: bigint }>,
): Promise<void> {
  try {
    for (const bet of bets) {
      if (bet.amount <= 0n) continue;

      const user = await prisma.user.findUnique({
        where: { walletAddress: bet.walletAddress },
        select: { referredBy: true },
      });

      if (!user?.referredBy) continue;

      // Check idempotency
      const existing = await prisma.referralEarning.findFirst({
        where: { betId: bet.id },
      });
      if (existing) continue;

      const commissionAmount = (bet.amount * BigInt(COMMISSION_BPS)) / 10000n;
      if (commissionAmount <= 0n) continue;

      await prisma.referralEarning.create({
        data: {
          referrerWallet: user.referredBy,
          referredWallet: bet.walletAddress,
          betId: bet.id,
          poolId,
          feeAmount: bet.amount,
          commissionBps: COMMISSION_BPS,
          commissionAmount,
        },
      });
    }
  } catch (error) {
    console.error('[Referrals] recordReferralCommissions failed:', error);
  }
}

/**
 * Get referral stats for dashboard.
 */
export async function getReferralStats(walletAddress: string) {
  const [referralCount, earnings, code] = await Promise.all([
    prisma.referral.count({ where: { referrerWallet: walletAddress } }),
    prisma.referralEarning.aggregate({
      where: { referrerWallet: walletAddress },
      _sum: { commissionAmount: true },
    }),
    ensureReferralCode(walletAddress),
  ]);

  const unpaidEarnings = await prisma.referralEarning.aggregate({
    where: { referrerWallet: walletAddress, paid: false },
    _sum: { commissionAmount: true },
  });

  const referrals = await prisma.referral.findMany({
    where: { referrerWallet: walletAddress },
    orderBy: { createdAt: 'desc' },
    select: {
      referredWallet: true,
      createdAt: true,
    },
  });

  // Get per-referral earnings
  const referralEarningsByWallet = await prisma.referralEarning.groupBy({
    by: ['referredWallet'],
    where: { referrerWallet: walletAddress },
    _sum: { commissionAmount: true },
  });

  const earningsMap = new Map(
    referralEarningsByWallet.map((e) => [e.referredWallet, e._sum.commissionAmount ?? 0n]),
  );

  return {
    referralCode: code,
    totalReferrals: referralCount,
    totalEarned: (earnings._sum.commissionAmount ?? 0n).toString(),
    unpaidBalance: (unpaidEarnings._sum.commissionAmount ?? 0n).toString(),
    referrals: referrals.map((r) => ({
      wallet: r.referredWallet,
      joinedAt: r.createdAt.toISOString(),
      earned: (earningsMap.get(r.referredWallet) ?? 0n).toString(),
    })),
  };
}

/**
 * Get paginated earning history for a referrer.
 */
export async function getReferralEarnings(
  walletAddress: string,
  page: number = 1,
  limit: number = 20,
) {
  const skip = (page - 1) * limit;

  const [earnings, total] = await Promise.all([
    prisma.referralEarning.findMany({
      where: { referrerWallet: walletAddress },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.referralEarning.count({ where: { referrerWallet: walletAddress } }),
  ]);

  return {
    earnings: earnings.map((e) => ({
      id: e.id,
      referredWallet: e.referredWallet,
      poolId: e.poolId,
      feeAmount: e.feeAmount.toString(),
      commissionAmount: e.commissionAmount.toString(),
      paid: e.paid,
      paidTx: e.paidTx,
      createdAt: e.createdAt.toISOString(),
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get payout history for a referrer.
 */
export async function getReferralPayouts(walletAddress: string) {
  const payouts = await prisma.referralPayout.findMany({
    where: { walletAddress },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return payouts.map((p) => ({
    id: p.id,
    amount: p.amount.toString(),
    txSignature: p.txSignature,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  }));
}

/**
 * Claim referral payout: aggregates unpaid earnings, transfers USDC on-chain,
 * then marks earnings as paid. Authority signs the transfer (no user signature needed).
 */
export async function claimReferralPayout(
  walletAddress: string,
): Promise<{ success: boolean; payoutId?: string; amount?: string; txSignature?: string; error?: string }> {
  const unpaid = await prisma.referralEarning.aggregate({
    where: { referrerWallet: walletAddress, paid: false },
    _sum: { commissionAmount: true },
  });

  const amount = unpaid._sum.commissionAmount ?? 0n;

  // Minimum $1 USDC (1_000_000 base units)
  if (amount < 1_000_000n) {
    return { success: false, error: 'Minimum payout is $1 USDC' };
  }

  // Build on-chain USDC transfer: authority fee wallet → user
  const connection = getConnection();
  const authority = getAuthorityKeypair();
  const usdcMint = getUsdcMint();
  const userPubkey = new PublicKey(walletAddress);

  const authorityAta = await getAssociatedTokenAddress(usdcMint, authority.publicKey);
  const userAta = await getAssociatedTokenAddress(usdcMint, userPubkey);

  // Check authority has enough balance
  try {
    const balance = await connection.getTokenAccountBalance(authorityAta);
    if (BigInt(balance.value.amount) < amount) {
      return { success: false, error: 'Insufficient platform balance. Please try later.' };
    }
  } catch {
    return { success: false, error: 'Platform fee wallet not found' };
  }

  // Build and send transfer
  const ix = createTransferInstruction(authorityAta, userAta, authority.publicKey, amount);
  const transaction = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = authority.publicKey;
  transaction.sign(authority);

  const txSignature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  const confirmation = await connection.confirmTransaction(
    { signature: txSignature, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  if (confirmation.value.err) {
    return { success: false, error: 'Transfer failed on-chain' };
  }

  // Transfer succeeded — update DB
  const result = await prisma.$transaction(async (tx) => {
    const payout = await tx.referralPayout.create({
      data: {
        walletAddress,
        amount,
        txSignature,
        status: 'completed',
      },
    });

    await tx.referralEarning.updateMany({
      where: { referrerWallet: walletAddress, paid: false },
      data: { paid: true, paidTx: txSignature },
    });

    return payout;
  });

  return {
    success: true,
    payoutId: result.id,
    amount: amount.toString(),
    txSignature,
  };
}
