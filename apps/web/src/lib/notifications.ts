import type { NotificationType, NotificationSeverity, NotificationInput } from '@/stores/notificationStore';

interface NotificationDef {
  severity: NotificationSeverity;
  autoHideDuration: number;
  build: (ctx: Record<string, unknown>) => { title: string; message: string };
}

export const NOTIFICATION_DEFS: Record<NotificationType, NotificationDef> = {
  POOL_WON: {
    severity: 'success',
    autoHideDuration: 8000,
    build: (ctx) => ({
      title: 'You Won!',
      message: `${ctx.asset ?? 'Asset'}/USD ${ctx.interval ?? ''} — Collect your winnings`,
    }),
  },
  POOL_LOST: {
    severity: 'warning',
    autoHideDuration: 6000,
    build: (ctx) => ({
      title: 'Better Luck Next Time',
      message: `${ctx.asset ?? 'Asset'}/USD ${ctx.interval ?? ''} — Prediction was incorrect`,
    }),
  },
  POOL_CLAIMABLE: {
    severity: 'success',
    autoHideDuration: 10000,
    build: (ctx) => ({
      title: 'Claim Available',
      message: `${ctx.asset ?? 'Asset'}/USD — Your payout is ready to claim`,
    }),
  },
  POOL_RESOLVED: {
    severity: 'info',
    autoHideDuration: 5000,
    build: (ctx) => ({
      title: 'Pool Resolved',
      message: `${ctx.asset ?? 'Asset'}/USD ${ctx.interval ?? ''} — Winner: ${ctx.winner ?? 'N/A'}`,
    }),
  },
  REFUND_RECEIVED: {
    severity: 'info',
    autoHideDuration: 8000,
    build: (ctx) => ({
      title: 'Refund Received',
      message: ctx.message as string || 'A refund has been issued to your wallet',
    }),
  },
  DEPOSIT_SUCCESS: {
    severity: 'success',
    autoHideDuration: 5000,
    build: (ctx) => ({
      title: 'Prediction Placed',
      message: `${ctx.side ?? ''} on ${ctx.asset ?? 'pool'} — Good luck!`,
    }),
  },
  DEPOSIT_FAILED: {
    severity: 'error',
    autoHideDuration: 8000,
    build: (ctx) => ({
      title: 'Transaction Failed',
      message: (ctx.error as string) || 'Deposit could not be completed',
    }),
  },
  CLAIM_SUCCESS: {
    severity: 'success',
    autoHideDuration: 6000,
    build: (ctx) => ({
      title: 'Payout Claimed',
      message: ctx.amount ? `${ctx.amount} sent to your wallet` : 'Payout sent to your wallet',
    }),
  },
  CLAIM_FAILED: {
    severity: 'error',
    autoHideDuration: 8000,
    build: (ctx) => ({
      title: 'Claim Failed',
      message: (ctx.error as string) || 'Could not process the claim',
    }),
  },
  XP_EARNED: {
    severity: 'info',
    autoHideDuration: 4000,
    build: (ctx) => ({
      title: `+${ctx.xp} XP`,
      message: `Total: ${Number(ctx.totalXp).toLocaleString()} XP`,
    }),
  },
  COINS_EARNED: {
    severity: 'info',
    autoHideDuration: 4000,
    build: (ctx) => ({
      title: `+${ctx.coins} UP Coins`,
      message: 'Keep betting to earn more!',
    }),
  },
  LEVEL_UP: {
    severity: 'success',
    autoHideDuration: 8000,
    build: (ctx) => ({
      title: `Level Up! Lv.${ctx.level}`,
      message: 'You unlocked a new fee discount tier!',
    }),
  },
};

/** Helper to build a full NotificationInput from a type + context */
export function buildNotification(
  type: NotificationType,
  ctx: Record<string, unknown> = {},
): NotificationInput {
  const def = NOTIFICATION_DEFS[type];
  const { title, message } = def.build(ctx);
  return {
    type,
    title,
    message,
    severity: def.severity,
    autoHideDuration: def.autoHideDuration,
    poolId: ctx.poolId as string | undefined,
    asset: ctx.asset as string | undefined,
    level: ctx.level as number | undefined,
  };
}
