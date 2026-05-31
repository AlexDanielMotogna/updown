import { prisma } from '../db';

/**
 * Distinct bettor wallets in a pool.
 *
 * A wallet may hold multiple bet rows in the same pool (one per side, for
 * hedging), so anything that means "number of participants" - the squad
 * maxBettors check and the single-bettor fee waiver - must be computed over
 * DISTINCT wallets, not bet rows.
 */
export async function getDistinctBettorWallets(poolId: string): Promise<string[]> {
  const rows = await prisma.bet.findMany({
    where: { poolId },
    select: { walletAddress: true },
    distinct: ['walletAddress'],
  });
  return rows.map((r) => r.walletAddress);
}
