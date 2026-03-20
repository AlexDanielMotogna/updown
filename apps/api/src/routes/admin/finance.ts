import { Router, type Router as RouterType } from 'express';
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
      },
    });
  } catch (error) {
    console.error('Admin finance error:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch finance data' } });
  }
});
