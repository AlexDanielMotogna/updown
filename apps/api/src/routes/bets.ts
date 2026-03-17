import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../db';

import { getFeeBps, DEFAULT_FEE_BPS } from '../utils/fees';
import { calculatePayout } from '../utils/payout';
import { serializeBet } from '../utils/serializers';

export const betsRouter: RouterType = Router();

// Query schema for bets listing
const betsQuerySchema = z.object({
  wallet: z.string().min(32).max(44),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// GET /api/bets - List user's bets
betsRouter.get('/', async (req, res) => {
  try {
    const parsed = betsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'wallet query parameter is required (32-44 characters)',
          details: parsed.error.flatten(),
        },
      });
    }

    const { wallet, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const [bets, total, userRecord] = await Promise.all([
      prisma.bet.findMany({
        where: { walletAddress: wallet },
        include: {
          pool: {
            select: {
              id: true,
              poolId: true,
              asset: true,
              interval: true,
              status: true,
              startTime: true,
              endTime: true,
              strikePrice: true,
              finalPrice: true,
              totalUp: true,
              totalDown: true,
              winner: true,
              _count: { select: { bets: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.bet.count({ where: { walletAddress: wallet } }),
      prisma.user.findUnique({ where: { walletAddress: wallet }, select: { level: true } }),
    ]);

    const feeBps = userRecord ? getFeeBps(userRecord.level) : DEFAULT_FEE_BPS;

    res.json({
      success: true,
      data: bets.map((b) => serializeBet(b, feeBps)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching bets:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch bets',
      },
    });
  }
});

// GET /api/bets/claimable - Get claimable bets for a wallet
betsRouter.get('/claimable', async (req, res) => {
  try {
    const walletAddress = req.query.wallet as string;

    if (!walletAddress || walletAddress.length < 32 || walletAddress.length > 44) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'wallet query parameter is required (32-44 characters)',
        },
      });
    }

    // Find bets where:
    // 1. User's bet matches the winning side
    // 2. Pool is in CLAIMABLE status
    // 3. Bet has not been claimed yet
    const bets = await prisma.bet.findMany({
      where: {
        walletAddress,
        claimed: false,
        pool: {
          status: 'CLAIMABLE',
          winner: { not: null },
        },
      },
      include: {
        pool: {
          select: {
            id: true,
            poolId: true,
            asset: true,
            interval: true,
            status: true,
            startTime: true,
            endTime: true,
            strikePrice: true,
            finalPrice: true,
            totalUp: true,
            totalDown: true,
            winner: true,
            _count: { select: { bets: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter to only winning bets
    const winningBets = bets.filter(bet => bet.pool.winner === bet.side);

    // Look up user level for fee calculation
    const userRecord = await prisma.user.findUnique({
      where: { walletAddress },
      select: { level: true },
    });
    const feeBps = userRecord ? getFeeBps(userRecord.level) : DEFAULT_FEE_BPS;

    // Calculate total claimable amount
    const totalClaimable = winningBets.reduce((sum, bet) => {
      const { payout } = calculatePayout({
        betAmount: bet.amount,
        totalUp: bet.pool.totalUp,
        totalDown: bet.pool.totalDown,
        side: bet.side,
        betCount: bet.pool._count.bets,
        feeBps,
      });
      return sum + payout;
    }, 0n);

    res.json({
      success: true,
      data: {
        bets: winningBets.map((b) => serializeBet(b, feeBps)),
        summary: {
          count: winningBets.length,
          totalClaimable: totalClaimable.toString(),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching claimable bets:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch claimable bets',
      },
    });
  }
});
