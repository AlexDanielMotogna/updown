import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import type { Side, PoolStatus } from '@prisma/client';

export const betsRouter: RouterType = Router();

const PLATFORM_FEE_BPS = 500; // 5% = 500 basis points

// Query schema for bets listing
const betsQuerySchema = z.object({
  wallet: z.string().min(32).max(44),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Helper to serialize bet with pool info
function serializeBet(bet: {
  id: string;
  poolId: string;
  walletAddress: string;
  side: Side;
  amount: bigint;
  depositTx: string | null;
  claimed: boolean;
  claimTx: string | null;
  payoutAmount: bigint | null;
  createdAt: Date;
  updatedAt: Date;
  pool: {
    id: string;
    poolId: string;
    asset: string;
    status: PoolStatus;
    startTime: Date;
    endTime: Date;
    strikePrice: bigint | null;
    finalPrice: bigint | null;
    totalUp: bigint;
    totalDown: bigint;
    winner: Side | null;
  };
}) {
  const totalPool = bet.pool.totalUp + bet.pool.totalDown;
  const isWinner = bet.pool.winner === bet.side;

  // Calculate potential/actual payout
  let payout: string | null = null;
  if (bet.pool.winner && isWinner) {
    const winnerPool = bet.side === 'UP' ? bet.pool.totalUp : bet.pool.totalDown;
    if (winnerPool > 0n) {
      const share = Number(bet.amount) / Number(winnerPool);
      const grossPayout = Math.floor(share * Number(totalPool));
      const fee = Math.floor((grossPayout * PLATFORM_FEE_BPS) / 10000);
      payout = (grossPayout - fee).toString();
    }
  }

  return {
    id: bet.id,
    poolId: bet.poolId,
    walletAddress: bet.walletAddress,
    side: bet.side,
    amount: bet.amount.toString(),
    depositTx: bet.depositTx,
    claimed: bet.claimed,
    claimTx: bet.claimTx,
    payoutAmount: bet.payoutAmount?.toString() ?? payout,
    isWinner: bet.pool.winner ? isWinner : null,
    createdAt: bet.createdAt.toISOString(),
    pool: {
      id: bet.pool.id,
      poolId: bet.pool.poolId,
      asset: bet.pool.asset,
      status: bet.pool.status,
      startTime: bet.pool.startTime.toISOString(),
      endTime: bet.pool.endTime.toISOString(),
      strikePrice: bet.pool.strikePrice?.toString() ?? null,
      finalPrice: bet.pool.finalPrice?.toString() ?? null,
      winner: bet.pool.winner,
    },
  };
}

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

    const [bets, total] = await Promise.all([
      prisma.bet.findMany({
        where: { walletAddress: wallet },
        include: {
          pool: {
            select: {
              id: true,
              poolId: true,
              asset: true,
              status: true,
              startTime: true,
              endTime: true,
              strikePrice: true,
              finalPrice: true,
              totalUp: true,
              totalDown: true,
              winner: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.bet.count({ where: { walletAddress: wallet } }),
    ]);

    res.json({
      success: true,
      data: bets.map(serializeBet),
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
            status: true,
            startTime: true,
            endTime: true,
            strikePrice: true,
            finalPrice: true,
            totalUp: true,
            totalDown: true,
            winner: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter to only winning bets
    const winningBets = bets.filter(bet => bet.pool.winner === bet.side);

    // Calculate total claimable amount
    const totalClaimable = winningBets.reduce((sum, bet) => {
      const totalPool = bet.pool.totalUp + bet.pool.totalDown;
      const winnerPool = bet.side === 'UP' ? bet.pool.totalUp : bet.pool.totalDown;
      if (winnerPool > 0n) {
        const share = Number(bet.amount) / Number(winnerPool);
        const grossPayout = BigInt(Math.floor(share * Number(totalPool)));
        const fee = (grossPayout * BigInt(PLATFORM_FEE_BPS)) / 10000n;
        return sum + (grossPayout - fee);
      }
      return sum;
    }, 0n);

    res.json({
      success: true,
      data: {
        bets: winningBets.map(serializeBet),
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
