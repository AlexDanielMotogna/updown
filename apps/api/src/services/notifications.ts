import { Side } from '@prisma/client';
import { prisma } from '../db';
import { autoPayoutEnabledFor } from '../utils/auto-payout-flag';
import { calculateWeightedPayout, resolveFeeBps } from '../utils/payout';
import { poolKind } from '../utils/pool-kind';

/** Human label for a pool: PM → its question, sports → "A vs B", crypto → asset. */
function matchLabelFor(pool: { poolType?: string | null; league?: string | null; homeTeam?: string | null; awayTeam?: string | null; asset: string }): string {
  const kind = poolKind(pool);
  if (kind === 'pm') return pool.homeTeam || pool.asset;
  if (kind === 'sports' && pool.homeTeam) return `${pool.homeTeam} vs ${pool.awayTeam}`;
  return pool.asset;
}

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
      select: { walletAddress: true, side: true, amount: true, weight: true },
    });

    if (bets.length === 0) return;

    const matchLabel = matchLabelFor(pool);
    const scoreLabel = pool.homeScore != null && pool.awayScore != null
      ? ` (${pool.homeScore}-${pool.awayScore})`
      : '';

    const autoEnabled = await autoPayoutEnabledFor({
      poolType: pool.poolType,
      league: pool.league ?? null,
    });

    // A wallet can hold bets on multiple sides, so "won/lost" isn't meaningful
    // per pool — we send ONE net-result notification per wallet. Net is the
    // time-weighted payout (mirrors the on-chain claim) minus total stake.
    const winner = pool.winner;
    const winningWeightSum = bets
      .filter(b => b.side === winner)
      .reduce((a, b) => a + (b.weight ?? b.amount), 0n);
    const losingStakeTotal = bets
      .filter(b => b.side !== winner)
      .reduce((a, b) => a + b.amount, 0n);
    const distinctWallets = new Set(bets.map(b => b.walletAddress)).size;

    const byWallet = new Map<string, typeof bets>();
    for (const b of bets) {
      const arr = byWallet.get(b.walletAddress);
      if (arr) arr.push(b); else byWallet.set(b.walletAddress, [b]);
    }

    const notifications: Array<{
      walletAddress: string; type: string; title: string; message: string;
      severity: 'success' | 'warning'; poolId: string; poolType: string;
    }> = [];

    for (const [wallet, wbets] of byWallet) {
      const stake = wbets.reduce((a, b) => a + b.amount, 0n);
      const feeBps = await resolveFeeBps(prisma, wallet);
      let payout = 0n;
      let hasWin = false;
      let hasLoss = false;
      for (const b of wbets) {
        if (b.side === winner) {
          hasWin = true;
          payout += calculateWeightedPayout({
            betAmount: b.amount,
            betWeight: b.weight ?? b.amount,
            winningWeightSum,
            losingStakeTotal,
            betCount: distinctWallets,
            feeBps,
          }).payout;
        } else {
          hasLoss = true;
        }
      }

      // A pure winner on an auto-payout pool gets the exact figure from the
      // BET_PAID notification the scheduler fires after transferring funds —
      // skip the summary to avoid a duplicate. Hedgers (win + loss) and
      // losers still get the net closure here.
      if (autoEnabled && hasWin && !hasLoss) continue;

      const net = payout - stake;
      const positive = net > 0n;
      const netStr = `${net >= 0n ? '+' : '-'}$${(Math.abs(Number(net)) / 1_000_000).toFixed(2)}`;
      notifications.push({
        walletAddress: wallet,
        type: positive ? 'POOL_WON' : 'POOL_LOST',
        title: positive ? 'You won' : 'Pool settled',
        message: `${matchLabel}${scoreLabel} · PnL ${netStr}`,
        severity: positive ? 'success' : 'warning',
        poolId: pool.id,
        poolType: pool.poolType,
      });
    }

    if (notifications.length === 0) return;

    await prisma.notification.createMany({ data: notifications });
    console.log(`[Notifications] Created ${notifications.length} net result(s) for pool ${pool.id}${autoEnabled ? ' (auto-payout: pure winners via BET_PAID)' : ''}`);
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
      where: { poolId: pool.id, side: pool.winner as Side, claimed: false },
      select: { walletAddress: true },
    });

    if (winningBets.length === 0) return;

    const matchLabel = matchLabelFor(pool);

    const notifications = winningBets.map(bet => ({
      walletAddress: bet.walletAddress,
      type: 'POOL_CLAIMABLE',
      title: 'Claim Available',
      message: `${matchLabel} - Your payout is ready to claim`,
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

/**
 * Create a "Bet Paid" notification when the scheduler's auto-claim job
 * has confirmed the on-chain transfer. Replaces the POOL_CLAIMABLE +
 * subsequent CLAIM_SUCCESS pair for users on auto-payout-enabled pools.
 */
export async function notifyBetPaid(
  walletAddress: string,
  pool: { id: string; asset: string; poolType: string; homeTeam?: string | null; awayTeam?: string | null },
  payoutUsdc: bigint,
  txSignature: string,
): Promise<void> {
  const matchLabel = matchLabelFor(pool);
  const dollarStr = (Number(payoutUsdc) / 1_000_000).toFixed(2);
  await createNotification({
    walletAddress,
    type: 'BET_PAID',
    title: `You won $${dollarStr}`,
    message: `${matchLabel} - Payout sent to your wallet`,
    severity: 'success',
    poolId: pool.id,
    poolType: pool.poolType,
  });
}
