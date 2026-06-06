import { prisma } from '../db';
import { ACTIVE_BET_THRESHOLD, MILESTONES, MILESTONE_POOL } from '../utils/testing';

let ensured = false;

/** Upsert the milestone config rows once per process (idempotent). */
async function ensureMilestones(): Promise<void> {
  if (ensured) return;
  await prisma.milestone.createMany({
    data: MILESTONES.map((m, i) => ({
      key: m.key,
      label: m.label,
      targetUsers: m.targetUsers,
      rewardPool: MILESTONE_POOL,
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
  ensured = true;
}

/** Wallets flagged suspect by the referral anti-cheat — excluded from airdrops. */
async function suspectWalletSet(): Promise<Set<string>> {
  const rows = await prisma.referral.findMany({ where: { suspect: true }, select: { referredWallet: true } });
  return new Set(rows.map(r => r.referredWallet));
}

/**
 * Distribute a milestone's pool: 50% equally among qualified users + 50%
 * pro-rata by settledBets. Idempotent per user via RewardGrant. Marks the
 * milestone completed.
 */
async function distributeMilestone(milestone: { id: string; key: string; rewardPool: bigint }, totalUsers: number): Promise<void> {
  const suspects = await suspectWalletSet();
  const activeUsers = await prisma.user.findMany({
    where: { settledBets: { gte: ACTIVE_BET_THRESHOLD } },
    select: { walletAddress: true, settledBets: true, level: true },
  });
  const qualified = activeUsers.filter(u => !suspects.has(u.walletAddress));

  if (qualified.length > 0) {
    const pool = milestone.rewardPool;
    const equalHalf = pool / 2n;
    const effortHalf = pool - equalHalf;
    const equalPer = equalHalf / BigInt(qualified.length);
    const totalEffort = qualified.reduce((a, u) => a + BigInt(u.settledBets), 0n) || 1n;
    const type = `MILESTONE_${milestone.key.toUpperCase()}`;

    for (const u of qualified) {
      const effortShare = (effortHalf * BigInt(u.settledBets)) / totalEffort;
      const amount = equalPer + effortShare;
      if (amount <= 0n) continue;
      try {
        await prisma.rewardGrant.create({
          data: { walletAddress: u.walletAddress, type, amount, meta: { milestone: milestone.key } },
        });
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') continue; // already paid
        throw e;
      }
      await prisma.user.update({
        where: { walletAddress: u.walletAddress },
        data: { coinsBalance: { increment: amount }, coinsLifetime: { increment: amount } },
      });
    }
  }

  await prisma.milestone.update({
    where: { id: milestone.id },
    data: { status: 'completed', completedAt: new Date(), reachedUserCount: totalUsers },
  });
  await prisma.eventLog.create({
    data: {
      eventType: 'MILESTONE_COMPLETED',
      entityType: 'milestone',
      entityId: milestone.key,
      payload: { totalUsers, qualified: qualified.length, pool: milestone.rewardPool.toString() },
    },
  }).catch(() => { /* best-effort */ });
}

/**
 * Check whether any milestone target has been reached and distribute it.
 * Cheap when nothing is newly crossed — safe to call on user registration.
 */
export async function checkAndDistributeMilestones(): Promise<void> {
  try {
    await ensureMilestones();
    const totalUsers = await prisma.user.count();
    const due = await prisma.milestone.findMany({
      where: { status: 'active', targetUsers: { lte: totalUsers } },
      orderBy: { sortOrder: 'asc' },
    });
    for (const m of due) {
      await distributeMilestone(m, totalUsers);
    }
  } catch (error) {
    console.error('[Milestones] check failed:', error);
  }
}

/** Milestone progress + contributor board for the UI. */
export async function getMilestoneState(wallet?: string | null): Promise<unknown> {
  await ensureMilestones();
  const [totalUsers, milestones, suspects] = await Promise.all([
    prisma.user.count(),
    prisma.milestone.findMany({ orderBy: { sortOrder: 'asc' } }),
    suspectWalletSet(),
  ]);

  // Top contributors by effort (settledBets), qualified only.
  const activeUsers = await prisma.user.findMany({
    where: { settledBets: { gte: ACTIVE_BET_THRESHOLD } },
    select: { walletAddress: true, displayName: true, avatarUrl: true, settledBets: true },
    orderBy: { settledBets: 'desc' },
    take: 50,
  });
  const contributors = activeUsers
    .filter(u => !suspects.has(u.walletAddress))
    .map((u, i) => ({
      rank: i + 1,
      walletAddress: u.walletAddress,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      settledBets: u.settledBets,
    }));

  let self: { settledBets: number; qualified: boolean } | null = null;
  if (wallet) {
    const u = await prisma.user.findUnique({ where: { walletAddress: wallet }, select: { settledBets: true } });
    if (u) self = { settledBets: u.settledBets, qualified: u.settledBets >= ACTIVE_BET_THRESHOLD && !suspects.has(wallet) };
  }

  return {
    totalUsers,
    activeThreshold: ACTIVE_BET_THRESHOLD,
    milestones: milestones.map(m => ({
      key: m.key,
      label: m.label,
      targetUsers: m.targetUsers,
      rewardPool: (Number(m.rewardPool) / 100), // display UP
      status: m.status,
      completedAt: m.completedAt ? m.completedAt.toISOString() : null,
    })),
    contributors,
    self,
  };
}
