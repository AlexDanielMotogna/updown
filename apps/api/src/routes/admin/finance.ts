import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { getConnection, getAuthorityKeypair, getUsdcMint } from '../../utils/solana';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { calculatePayout } from '../../utils/payout';
import { getFeeBps } from '../../utils/fees';

export const adminFinanceRouter: RouterType = Router();

adminFinanceRouter.get('/overview', async (_req, res) => {
  try {
    const [
      poolStatusCounts,
      volumeAgg,
      payoutAgg,
      totalBets,
      claimedWinningBets,
    ] = await Promise.all([
      prisma.pool.groupBy({ by: ['status'], _count: true }),
      prisma.bet.aggregate({ _sum: { amount: true }, _count: true }),
      prisma.bet.aggregate({ _sum: { payoutAmount: true }, where: { claimed: true } }),
      prisma.bet.count(),
      // Get all claimed bets with their pool data to compute fees
      prisma.bet.findMany({
        where: { claimed: true, payoutAmount: { not: null } },
        select: {
          amount: true,
          side: true,
          payoutAmount: true,
          walletAddress: true,
          pool: {
            select: { totalUp: true, totalDown: true, winner: true, _count: { select: { bets: true } } },
          },
        },
      }),
    ]);

    // Calculate total fees collected from claimed winning bets
    // fee = grossPayout - netPayout for each winning bet
    let totalFeesCollected = BigInt(0);
    for (const bet of claimedWinningBets) {
      if (bet.pool.winner !== bet.side) continue; // skip refunds/losers
      if (bet.pool._count.bets <= 1) continue; // fee waived for single bettor

      const winnerPool = bet.side === 'UP' ? bet.pool.totalUp : bet.pool.totalDown;
      const totalPool = bet.pool.totalUp + bet.pool.totalDown;
      if (winnerPool <= 0n) continue;

      const grossPayout = (bet.amount * totalPool) / winnerPool;
      const netPayout = bet.payoutAmount ?? BigInt(0);
      const fee = grossPayout - netPayout;
      if (fee > 0n) totalFeesCollected += fee;
    }

    // Authority USDC balance (on-chain = accumulated fees)
    let authorityUsdcRaw: string | null = null;
    let authorityUsdcDisplay: string | null = null;
    try {
      const connection = getConnection();
      const wallet = getAuthorityKeypair();
      const ata = await getAssociatedTokenAddress(getUsdcMint(), wallet.publicKey);
      const balance = await connection.getTokenAccountBalance(ata);
      authorityUsdcRaw = balance.value.amount;
      authorityUsdcDisplay = balance.value.uiAmountString ?? null;
    } catch {
      // Authority might not have USDC ATA
    }

    const statusMap: Record<string, number> = {};
    for (const row of poolStatusCounts) {
      statusMap[row.status] = row._count;
    }

    const totalVolume = volumeAgg._sum.amount?.toString() ?? '0';
    const totalPayouts = payoutAgg._sum.payoutAmount?.toString() ?? '0';

    // Pool closure stats from event logs
    const closureEvents = await prisma.eventLog.findMany({
      where: { eventType: 'POOL_CLOSED', entityType: 'closure' },
      select: { payload: true },
    });
    let totalRentReclaimed = 0;
    let totalPoolsClosed = closureEvents.length;
    for (const ev of closureEvents) {
      const payload = ev.payload as Record<string, string> | null;
      if (payload?.rentReclaimedLamports) {
        totalRentReclaimed += Number(payload.rentReclaimedLamports);
      }
    }

    res.json({
      success: true,
      data: {
        totalVolume,
        totalPayouts,
        totalFeesCollected: totalFeesCollected.toString(),
        totalBets,
        authorityUsdcBalance: authorityUsdcRaw,
        authorityUsdcDisplay,
        poolStatusCounts: statusMap,
        closures: {
          totalPoolsClosed,
          totalRentReclaimedLamports: totalRentReclaimed,
          totalRentReclaimedSol: (totalRentReclaimed / 1e9).toFixed(6),
        },
      },
    });
  } catch (error) {
    console.error('Admin finance error:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch finance data' } });
  }
});

// GET /finance/closures — Paginated list of closed pools with rent reclaimed
const closuresSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(30),
});

adminFinanceRouter.get('/closures', async (req, res) => {
  try {
    const parsed = closuresSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: parsed.error.flatten() } });
    }
    const { page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const [closures, total] = await Promise.all([
      prisma.eventLog.findMany({
        where: { eventType: 'POOL_CLOSED', entityType: 'closure' },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.eventLog.count({ where: { eventType: 'POOL_CLOSED', entityType: 'closure' } }),
    ]);

    res.json({
      success: true,
      data: closures.map(e => ({
        id: e.id,
        poolId: e.entityId,
        payload: e.payload,
        closedAt: e.createdAt.toISOString(),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin closures error:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch closures' } });
  }
});
