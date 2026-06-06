import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { ACTIVE_BET_THRESHOLD, referralPrizeForRank } from '../../utils/testing';
import { grantReferrerReward } from '../../services/rewards';
import { getReferralLeaderboard } from '../../services/referrals';

export const adminReferralsRouter: RouterType = Router();

/**
 * Growth / referral activity for the admin panel: who invited whom, and
 * whether the invited users actually use the platform (real resolutions, not
 * just a registered wallet). "Active" = settledBets >= ACTIVE_BET_THRESHOLD,
 * the same farm-proof definition the rewards use.
 */
adminReferralsRouter.get('/', async (_req, res) => {
  try {
    const referrals = await prisma.referral.findMany({
      select: {
        id: true, referrerWallet: true, referredWallet: true, createdAt: true,
        suspect: true, suspectReason: true, reviewed: true,
        signupIp: true, deviceFingerprint: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const involved = Array.from(new Set(referrals.flatMap(r => [r.referrerWallet, r.referredWallet])));
    const users = await prisma.user.findMany({
      where: { walletAddress: { in: involved } },
      select: { walletAddress: true, displayName: true, settledBets: true, totalBets: true, lastActiveDate: true },
    });
    const byWallet = new Map(users.map(u => [u.walletAddress, u]));
    const isActive = (w: string) => (byWallet.get(w)?.settledBets ?? 0) >= ACTIVE_BET_THRESHOLD;

    const grouped = new Map<string, typeof referrals>();
    for (const r of referrals) {
      const arr = grouped.get(r.referrerWallet);
      if (arr) arr.push(r);
      else grouped.set(r.referrerWallet, [r]);
    }

    const referrers = [...grouped.entries()].map(([referrerWallet, refs]) => {
      const referred = refs.map(r => {
        const u = byWallet.get(r.referredWallet);
        return {
          referralId: r.id,
          walletAddress: r.referredWallet,
          displayName: u?.displayName ?? null,
          settledBets: u?.settledBets ?? 0,
          totalBets: u?.totalBets ?? 0,
          lastActiveDate: u?.lastActiveDate ? u.lastActiveDate.toISOString() : null,
          active: isActive(r.referredWallet),
          suspect: r.suspect,
          suspectReason: r.suspectReason,
          reviewed: r.reviewed,
          signupIp: r.signupIp,
          deviceFingerprint: r.deviceFingerprint,
        };
      });
      const refUser = byWallet.get(referrerWallet);
      return {
        referrerWallet,
        displayName: refUser?.displayName ?? null,
        referredCount: referred.length,
        activeReferredCount: referred.filter(r => r.active).length,
        suspectCount: referred.filter(r => r.suspect).length,
        referred,
      };
    }).sort((a, b) => b.referredCount - a.referredCount);

    const [totalUsers, activeUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { settledBets: { gte: ACTIVE_BET_THRESHOLD } } }),
    ]);
    const activeReferred = referrers.reduce((a, r) => a + r.activeReferredCount, 0);
    const suspectReferred = referrals.filter(r => r.suspect).length;

    res.json({
      success: true,
      data: {
        summary: {
          totalUsers,
          activeUsers,
          totalReferred: referrals.length,
          activeReferred,
          suspectReferred,
          activeThreshold: ACTIVE_BET_THRESHOLD,
        },
        referrers,
      },
    });
  } catch (error) {
    console.error('[Admin] referrals error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load referral activity' } });
  }
});

/** Admin override of a referral's suspect flag. */
adminReferralsRouter.post('/:id/review', async (req, res) => {
  try {
    const parsed = z.object({ suspect: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'suspect (boolean) required' } });
    }
    const ref = await prisma.referral.update({
      where: { id: req.params.id },
      data: { suspect: parsed.data.suspect, reviewed: true },
      select: { referredWallet: true, suspect: true },
    }).catch(() => null);
    if (!ref) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Referral not found' } });

    // Cleared a flag and the referred user is already activated → pay the
    // referrer now (idempotent).
    if (!ref.suspect) {
      const u = await prisma.user.findUnique({ where: { walletAddress: ref.referredWallet }, select: { settledBets: true } });
      if (u) grantReferrerReward(ref.referredWallet, u.settledBets).catch(() => { /* best-effort */ });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] referral review error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update referral' } });
  }
});

/**
 * Distribute the top-20 referral prizes (campaign end). Idempotent per wallet
 * via RewardGrant 'REFERRAL_PRIZE' — re-running never double-pays. Pass
 * { dryRun: true } to preview the payout table without crediting anything.
 */
adminReferralsRouter.post('/distribute-prizes', async (req, res) => {
  try {
    const dryRun = z.object({ dryRun: z.boolean().optional() }).parse(req.body ?? {}).dryRun ?? false;
    const board = await getReferralLeaderboard();

    const results: Array<{ rank: number; walletAddress: string; displayName: string | null; validReferrals: number; prize: number; status: string }> = [];
    let paid = 0;
    let alreadyPaid = 0;

    for (const e of board) {
      const prize = referralPrizeForRank(e.rank); // display UP
      if (prize <= 0) continue; // outside top tiers
      if (e.validReferrals <= 0) continue; // no valid referrals → no prize
      const amount = BigInt(prize) * 100n; // stored units

      if (dryRun) {
        results.push({ rank: e.rank, walletAddress: e.walletAddress, displayName: e.displayName, validReferrals: e.validReferrals, prize, status: 'preview' });
        continue;
      }
      try {
        await prisma.rewardGrant.create({
          data: { walletAddress: e.walletAddress, type: 'REFERRAL_PRIZE', amount, meta: { rank: e.rank, validReferrals: e.validReferrals } },
        });
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') {
          alreadyPaid++;
          results.push({ rank: e.rank, walletAddress: e.walletAddress, displayName: e.displayName, validReferrals: e.validReferrals, prize, status: 'already_paid' });
          continue;
        }
        throw err;
      }
      await prisma.user.update({
        where: { walletAddress: e.walletAddress },
        data: { coinsBalance: { increment: amount }, coinsLifetime: { increment: amount } },
      });
      await prisma.eventLog.create({
        data: { eventType: 'REFERRAL_PRIZE_PAID', entityType: 'user', entityId: e.walletAddress, payload: { rank: e.rank, prize, validReferrals: e.validReferrals } },
      }).catch(() => { /* best-effort */ });
      paid++;
      results.push({ rank: e.rank, walletAddress: e.walletAddress, displayName: e.displayName, validReferrals: e.validReferrals, prize, status: 'paid' });
    }

    res.json({ success: true, data: { dryRun, paid, alreadyPaid, count: results.length, results } });
  } catch (error) {
    console.error('[Admin] distribute prizes error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to distribute prizes' } });
  }
});
