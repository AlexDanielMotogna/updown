import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { registerUser } from '../services/rewards';
import { getLevelTitle } from '../utils/levels';
import { serializeUserProfile } from '../utils/serializers';

export const usersRouter: RouterType = Router();

const walletSchema = z.object({
  walletAddress: z.string().min(32).max(44),
});

const profileQuerySchema = z.object({
  wallet: z.string().min(32).max(44),
});

const rewardHistorySchema = z.object({
  wallet: z.string().min(32).max(44),
  type: z.enum(['XP', 'COINS']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const leaderboardSchema = z.object({
  sort: z.enum(['xp', 'coins', 'level']).default('xp'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

/**
 * POST /api/users/register
 * Upsert a user on wallet connect.
 */
usersRouter.post('/register', async (req, res) => {
  try {
    const parsed = walletSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid wallet address' },
      });
    }

    const user = await registerUser(parsed.data.walletAddress);

    res.json({
      success: true,
      data: serializeUserProfile(user),
    });
  } catch (error) {
    console.error('[Users] register error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to register user' },
    });
  }
});

/**
 * GET /api/users/profile?wallet=
 * Return full user profile.
 */
usersRouter.get('/profile', async (req, res) => {
  try {
    const parsed = profileQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'wallet query parameter required' },
      });
    }

    const user = await prisma.user.findUnique({
      where: { walletAddress: parsed.data.wallet },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    res.json({
      success: true,
      data: serializeUserProfile(user),
    });
  } catch (error) {
    console.error('[Users] profile error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch profile' },
    });
  }
});

/**
 * GET /api/users/rewards?wallet=&type=&page=&limit=
 * Reward history with pagination.
 */
usersRouter.get('/rewards', async (req, res) => {
  try {
    const parsed = rewardHistorySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' },
      });
    }

    const { wallet, type, page, limit } = parsed.data;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { walletAddress: wallet };
    if (type) where.rewardType = type;

    const [rewards, total] = await Promise.all([
      prisma.rewardLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.rewardLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: rewards.map((r) => ({
        id: r.id,
        type: r.rewardType,
        reason: r.reason,
        amount: r.amount.toString(),
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[Users] rewards error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch rewards' },
    });
  }
});

/**
 * GET /api/users/leaderboard?sort=xp|coins|level&page=&limit=
 */
usersRouter.get('/leaderboard', async (req, res) => {
  try {
    const parsed = leaderboardSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' },
      });
    }

    const { sort, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const orderBy: Record<string, 'desc'> =
      sort === 'coins' ? { coinsLifetime: 'desc' }
      : sort === 'level' ? { level: 'desc' }
      : { totalXp: 'desc' };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: [orderBy, { createdAt: 'asc' }], // tie-break by oldest
        skip,
        take: limit,
      }),
      prisma.user.count(),
    ]);

    res.json({
      success: true,
      data: users.map((u, i) => ({
        rank: skip + i + 1,
        walletAddress: u.walletAddress,
        level: u.level,
        title: getLevelTitle(u.level),
        totalXp: u.totalXp.toString(),
        coinsLifetime: u.coinsLifetime.toString(),
        totalBets: u.totalBets,
        totalWins: u.totalWins,
        bestStreak: u.bestStreak,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[Users] leaderboard error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch leaderboard' },
    });
  }
});

