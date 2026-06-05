import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../db';

import { getFeeBps, DEFAULT_FEE_BPS } from '../utils/fees';
import { calculatePayout, calculateWeightedPayout } from '../utils/payout';
import { serializeBet } from '../utils/serializers';

export const betsRouter: RouterType = Router();

/**
 * Sum each pool's per-side time-weight, keyed `${poolId}:${side}`. The
 * resolved on-chain claim pays a winner `amount + weight × losingStake /
 * winningWeightSum − fee`, so the projection needs the winning side's total
 * weight. One grouped query covers every pool on the page.
 */
async function winningWeightByPoolSide(poolIds: string[]): Promise<Map<string, bigint>> {
  if (poolIds.length === 0) return new Map();
  const rows = await prisma.bet.groupBy({
    by: ['poolId', 'side'],
    where: { poolId: { in: poolIds } },
    _sum: { weight: true },
  });
  const m = new Map<string, bigint>();
  for (const r of rows) m.set(`${r.poolId}:${r.side}`, r._sum.weight ?? 0n);
  return m;
}

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
              totalDraw: true,
              winner: true,
              poolType: true,
              league: true,
              homeTeam: true,
              awayTeam: true,
              homeTeamCrest: true,
              awayTeamCrest: true,
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

    // Per-side weight sums for the pools on this page, so the payout
    // projection (resolved + active) matches the time-weighted on-chain claim.
    const weightMap = await winningWeightByPoolSide([...new Set(bets.map(b => b.poolId))]);
    const sideWeights = (poolId: string) => ({
      up: weightMap.get(`${poolId}:UP`) ?? 0n,
      down: weightMap.get(`${poolId}:DOWN`) ?? 0n,
      draw: weightMap.get(`${poolId}:DRAW`) ?? 0n,
    });

    res.json({
      success: true,
      data: bets.map((b) => serializeBet(b, feeBps, sideWeights(b.poolId))),
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
            totalDraw: true,
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

    // Winning-side weight sums so the claimable projection matches the
    // time-weighted on-chain claim (early entry = bigger share).
    const weightMap = await winningWeightByPoolSide([...new Set(winningBets.map(b => b.poolId))]);
    const sideWeights = (poolId: string) => ({
      up: weightMap.get(`${poolId}:UP`) ?? 0n,
      down: weightMap.get(`${poolId}:DOWN`) ?? 0n,
      draw: weightMap.get(`${poolId}:DRAW`) ?? 0n,
    });
    const winWeight = (b: typeof winningBets[number]) =>
      b.pool.winner ? weightMap.get(`${b.poolId}:${b.pool.winner}`) : undefined;

    // Calculate total claimable amount
    const totalClaimable = winningBets.reduce((sum, bet) => {
      const wSum = winWeight(bet);
      const totalPool = bet.pool.totalUp + bet.pool.totalDown + (bet.pool.totalDraw ?? 0n);
      const winnerStake = bet.side === 'UP' ? bet.pool.totalUp
        : bet.side === 'DOWN' ? bet.pool.totalDown
        : (bet.pool.totalDraw ?? 0n);
      const { payout } = (wSum != null && wSum > 0n && bet.weight != null)
        ? calculateWeightedPayout({
            betAmount: bet.amount,
            betWeight: bet.weight,
            winningWeightSum: wSum,
            losingStakeTotal: totalPool - winnerStake,
            betCount: bet.pool._count.bets,
            feeBps,
          })
        : calculatePayout({
            betAmount: bet.amount,
            totalUp: bet.pool.totalUp,
            totalDown: bet.pool.totalDown,
            totalDraw: bet.pool.totalDraw,
            side: bet.side,
            betCount: bet.pool._count.bets,
            feeBps,
          });
      return sum + payout;
    }, 0n);

    res.json({
      success: true,
      data: {
        bets: winningBets.map((b) => serializeBet(b, feeBps, sideWeights(b.poolId))),
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
