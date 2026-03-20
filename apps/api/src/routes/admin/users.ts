import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { getFeeBps } from '../../utils/fees';

export const adminUsersRouter: RouterType = Router();

// GET /users/search?wallet=... - Search user by wallet address
adminUsersRouter.get('/search', async (req, res) => {
  try {
    const wallet = z.string().min(32).max(44).safeParse(req.query.wallet);
    if (!wallet.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Valid wallet address required' } });
    }

    const user = await prisma.user.findUnique({
      where: { walletAddress: wallet.data },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    // Fetch recent bets with pool info
    const recentBets = await prisma.bet.findMany({
      where: { walletAddress: wallet.data },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        pool: {
          select: {
            id: true,
            asset: true,
            interval: true,
            status: true,
            winner: true,
            strikePrice: true,
            finalPrice: true,
            endTime: true,
          },
        },
      },
    });

    // Aggregate stats
    const [totalWagered, totalPayout, winCount, lossCount] = await Promise.all([
      prisma.bet.aggregate({ where: { walletAddress: wallet.data }, _sum: { amount: true } }),
      prisma.bet.aggregate({ where: { walletAddress: wallet.data, claimed: true }, _sum: { payoutAmount: true } }),
      prisma.bet.count({
        where: {
          walletAddress: wallet.data,
          pool: { winner: { not: null } },
          side: { not: undefined },
        },
      }).then(async () => {
        // Count wins by joining with pool
        const bets = await prisma.bet.findMany({
          where: { walletAddress: wallet.data },
          select: { side: true, pool: { select: { winner: true } } },
        });
        return bets.filter(b => b.pool.winner === b.side).length;
      }),
      prisma.bet.count({ where: { walletAddress: wallet.data } }).then(async (total) => {
        const bets = await prisma.bet.findMany({
          where: { walletAddress: wallet.data },
          select: { side: true, pool: { select: { winner: true } } },
        });
        const wins = bets.filter(b => b.pool.winner === b.side).length;
        const resolved = bets.filter(b => b.pool.winner !== null).length;
        return resolved - wins;
      }),
    ]);

    res.json({
      success: true,
      data: {
        profile: {
          walletAddress: user.walletAddress,
          level: user.level,
          totalXp: user.totalXp.toString(),
          coinsBalance: user.coinsBalance.toString(),
          coinsLifetime: user.coinsLifetime.toString(),
          totalBets: user.totalBets,
          totalWins: user.totalWins,
          totalWagered: user.totalWagered.toString(),
          currentStreak: user.currentStreak,
          bestStreak: user.bestStreak,
          feeBps: getFeeBps(user.level),
          feePercent: (getFeeBps(user.level) / 100).toFixed(2) + '%',
          createdAt: user.createdAt.toISOString(),
        },
        aggregates: {
          totalWagered: totalWagered._sum.amount?.toString() ?? '0',
          totalPayout: totalPayout._sum.payoutAmount?.toString() ?? '0',
          wins: winCount,
          losses: lossCount,
        },
        recentBets: recentBets.map(b => ({
          id: b.id,
          side: b.side,
          amount: b.amount.toString(),
          claimed: b.claimed,
          payoutAmount: b.payoutAmount?.toString() ?? null,
          createdAt: b.createdAt.toISOString(),
          pool: {
            id: b.pool.id,
            asset: b.pool.asset,
            interval: b.pool.interval,
            status: b.pool.status,
            winner: b.pool.winner,
            strikePrice: b.pool.strikePrice?.toString() ?? null,
            finalPrice: b.pool.finalPrice?.toString() ?? null,
            endTime: b.pool.endTime.toISOString(),
          },
          isWinner: b.pool.winner === b.side,
        })),
      },
    });
  } catch (error) {
    console.error('Admin user search error:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to search user' } });
  }
});

// GET /users/overview - User stats
adminUsersRouter.get('/overview', async (_req, res) => {
  try {
    const [totalUsers, totalBets, activeToday] = await Promise.all([
      prisma.user.count(),
      prisma.bet.count(),
      prisma.bet.groupBy({
        by: ['walletAddress'],
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }).then(r => r.length),
    ]);

    res.json({
      success: true,
      data: { totalUsers, totalBets, activeToday },
    });
  } catch (error) {
    console.error('Admin users overview error:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch user overview' } });
  }
});

// GET /users/top - Top 10 users by volume, wins, level
adminUsersRouter.get('/top', async (_req, res) => {
  try {
    const [byVolume, byWins, byLevel] = await Promise.all([
      prisma.user.findMany({
        orderBy: { totalWagered: 'desc' },
        take: 10,
        select: { walletAddress: true, totalWagered: true, totalBets: true, totalWins: true, level: true },
      }),
      prisma.user.findMany({
        orderBy: { totalWins: 'desc' },
        take: 10,
        select: { walletAddress: true, totalWins: true, totalBets: true, level: true },
      }),
      prisma.user.findMany({
        orderBy: [{ level: 'desc' }, { totalXp: 'desc' }],
        take: 10,
        select: { walletAddress: true, level: true, totalXp: true, totalBets: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        byVolume: byVolume.map(u => ({ ...u, totalWagered: u.totalWagered.toString() })),
        byWins,
        byLevel: byLevel.map(u => ({ ...u, totalXp: u.totalXp.toString() })),
      },
    });
  } catch (error) {
    console.error('Admin top users error:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch top users' } });
  }
});
