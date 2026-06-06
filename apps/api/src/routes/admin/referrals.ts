import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db';
import { ACTIVE_BET_THRESHOLD } from '../../utils/testing';

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
      select: { referrerWallet: true, referredWallet: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const involved = Array.from(new Set(referrals.flatMap(r => [r.referrerWallet, r.referredWallet])));
    const users = await prisma.user.findMany({
      where: { walletAddress: { in: involved } },
      select: { walletAddress: true, displayName: true, settledBets: true, totalBets: true, lastActiveDate: true },
    });
    const byWallet = new Map(users.map(u => [u.walletAddress, u]));
    const isActive = (w: string) => (byWallet.get(w)?.settledBets ?? 0) >= ACTIVE_BET_THRESHOLD;

    const grouped = new Map<string, string[]>();
    for (const r of referrals) {
      const arr = grouped.get(r.referrerWallet);
      if (arr) arr.push(r.referredWallet);
      else grouped.set(r.referrerWallet, [r.referredWallet]);
    }

    const referrers = [...grouped.entries()].map(([referrerWallet, referredWallets]) => {
      const referred = referredWallets.map(w => {
        const u = byWallet.get(w);
        return {
          walletAddress: w,
          displayName: u?.displayName ?? null,
          settledBets: u?.settledBets ?? 0,
          totalBets: u?.totalBets ?? 0,
          lastActiveDate: u?.lastActiveDate ? u.lastActiveDate.toISOString() : null,
          active: isActive(w),
        };
      });
      const refUser = byWallet.get(referrerWallet);
      return {
        referrerWallet,
        displayName: refUser?.displayName ?? null,
        referredCount: referred.length,
        activeReferredCount: referred.filter(r => r.active).length,
        referred,
      };
    }).sort((a, b) => b.referredCount - a.referredCount);

    const [totalUsers, activeUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { settledBets: { gte: ACTIVE_BET_THRESHOLD } } }),
    ]);
    const activeReferred = referrers.reduce((a, r) => a + r.activeReferredCount, 0);

    res.json({
      success: true,
      data: {
        summary: {
          totalUsers,
          activeUsers,
          totalReferred: referrals.length,
          activeReferred,
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
