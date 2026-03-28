import { prisma } from '../db';

interface NotificationInput {
  walletAddress: string;
  type: string;
  title: string;
  message: string;
  severity: 'success' | 'info' | 'warning' | 'error';
  poolId?: string;
  poolType?: string;
}

/** Create a single notification record. */
export async function createNotification(input: NotificationInput): Promise<void> {
  try {
    await prisma.notification.create({ data: input });
  } catch (error) {
    console.error('[Notifications] Failed to create:', (error as Error).message);
  }
}

/** Create notifications for all bettors in a resolved pool. */
export async function notifyPoolResolved(pool: {
  id: string;
  asset: string;
  poolType: string;
  winner: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  league?: string | null;
}): Promise<void> {
  if (!pool.winner) return;

  try {
    const bets = await prisma.bet.findMany({
      where: { poolId: pool.id },
      select: { walletAddress: true, side: true },
    });

    if (bets.length === 0) return;

    const isSports = pool.poolType === 'SPORTS';
    const matchLabel = isSports && pool.homeTeam
      ? `${pool.homeTeam} vs ${pool.awayTeam}`
      : `${pool.asset}`;
    const scoreLabel = pool.homeScore != null && pool.awayScore != null
      ? ` (${pool.homeScore}-${pool.awayScore})`
      : '';

    const notifications = bets.map(bet => {
      const won = bet.side === pool.winner;
      return {
        walletAddress: bet.walletAddress,
        type: won ? 'POOL_WON' : 'POOL_LOST',
        title: won ? 'You Won!' : 'Better Luck Next Time',
        message: won
          ? `${matchLabel}${scoreLabel} — Collect your winnings`
          : `${matchLabel}${scoreLabel} — Prediction was incorrect`,
        severity: won ? 'success' as const : 'warning' as const,
        poolId: pool.id,
        poolType: pool.poolType,
      };
    });

    await prisma.notification.createMany({ data: notifications });
    console.log(`[Notifications] Created ${notifications.length} for pool ${pool.id}`);
  } catch (error) {
    console.error('[Notifications] Failed to notify pool resolved:', (error as Error).message);
  }
}

/** Create "Claim Available" notification for winners when pool becomes claimable. */
export async function notifyPoolClaimable(pool: {
  id: string;
  asset: string;
  poolType: string;
  winner: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
}): Promise<void> {
  if (!pool.winner) return;

  try {
    const winningBets = await prisma.bet.findMany({
      where: { poolId: pool.id, side: pool.winner as any, claimed: false },
      select: { walletAddress: true },
    });

    if (winningBets.length === 0) return;

    const isSports = pool.poolType === 'SPORTS';
    const matchLabel = isSports && pool.homeTeam
      ? `${pool.homeTeam} vs ${pool.awayTeam}`
      : `${pool.asset}`;

    const notifications = winningBets.map(bet => ({
      walletAddress: bet.walletAddress,
      type: 'POOL_CLAIMABLE',
      title: 'Claim Available',
      message: `${matchLabel} — Your payout is ready to claim`,
      severity: 'success' as const,
      poolId: pool.id,
      poolType: pool.poolType,
    }));

    await prisma.notification.createMany({ data: notifications });
  } catch (error) {
    console.error('[Notifications] Failed to notify claimable:', (error as Error).message);
  }
}

/** Create refund notification for a specific wallet. */
export async function notifyRefund(walletAddress: string, poolId: string, message: string): Promise<void> {
  await createNotification({
    walletAddress,
    type: 'REFUND_RECEIVED',
    title: 'Refund Received',
    message,
    severity: 'info',
    poolId,
  });
}
