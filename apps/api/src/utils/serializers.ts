import type { PoolStatus, Side } from '@prisma/client';
import { getLevelTitle, getXpForLevel, getXpToNextLevel, getLevelForXp, getLevelMultiplier } from './levels';
import { getFeeBps, DEFAULT_FEE_BPS } from './fees';
import { calculatePayout } from './payout';

/* ─── Pool Serializer ─── */

export function serializePool(pool: Record<string, any> & {
  id: string;
  poolId: string;
  asset: string;
  interval: string;
  durationSeconds: number;
  status: PoolStatus;
  startTime: Date;
  endTime: Date;
  lockTime: Date;
  strikePrice: bigint | null;
  finalPrice: bigint | null;
  totalUp: bigint;
  totalDown: bigint;
  winner: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const totalDraw = pool.totalDraw ?? 0n;
  return {
    id: pool.id,
    poolId: pool.poolId,
    asset: pool.asset,
    interval: pool.interval,
    durationSeconds: pool.durationSeconds,
    status: pool.status,
    startTime: pool.startTime.toISOString(),
    endTime: pool.endTime.toISOString(),
    lockTime: pool.lockTime.toISOString(),
    strikePrice: pool.strikePrice?.toString() ?? null,
    finalPrice: pool.finalPrice?.toString() ?? null,
    totalUp: pool.totalUp.toString(),
    totalDown: pool.totalDown.toString(),
    totalDraw: totalDraw.toString(),
    totalPool: (pool.totalUp + pool.totalDown + totalDraw).toString(),
    winner: pool.winner,
    numSides: pool.numSides ?? 2,
    poolType: pool.poolType ?? 'CRYPTO',
    matchId: pool.matchId ?? null,
    homeTeam: pool.homeTeam ?? null,
    awayTeam: pool.awayTeam ?? null,
    homeTeamCrest: pool.homeTeamCrest ?? null,
    awayTeamCrest: pool.awayTeamCrest ?? null,
    league: pool.league ?? null,
    matchAnalysis: pool.matchAnalysis ?? null,
    homeScore: pool.homeScore ?? null,
    awayScore: pool.awayScore ?? null,
    marketOdds: pool.marketOdds ?? null,
    clobTokenIds: pool.clobTokenIds ?? null,
    tags: pool.tags ?? null,
    createdAt: pool.createdAt.toISOString(),
    updatedAt: pool.updatedAt.toISOString(),
  };
}

/* ─── Bet Serializer ─── */

export function serializeBet(bet: {
  id: string;
  poolId: string;
  walletAddress: string;
  side: Side;
  amount: bigint;
  depositTx: string | null;
  claimed: boolean;
  claimTx: string | null;
  payoutAmount: bigint | null;
  // Auto-payout tracking - present on Bet but optional here so non-auto callers
  // (existing test fixtures, force-resolve flows) can still serialize cleanly.
  payoutFailed?: boolean;
  payoutAttempts?: number;
  lastAttemptedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pool: {
    _count: { bets: number };
    id: string;
    poolId: string;
    asset: string;
    interval: string;
    status: PoolStatus;
    startTime: Date;
    endTime: Date;
    strikePrice: bigint | null;
    finalPrice: bigint | null;
    totalUp: bigint;
    totalDown: bigint;
    totalDraw?: bigint;
    winner: Side | null;
  };
}, feeBps: number = DEFAULT_FEE_BPS) {
  const isWinner = bet.pool.winner === bet.side;

  // Calculate potential/actual payout
  let payout: string | null = null;
  if (bet.pool.winner && isWinner) {
    const result = calculatePayout({
      betAmount: bet.amount,
      totalUp: bet.pool.totalUp,
      totalDown: bet.pool.totalDown,
      totalDraw: bet.pool.totalDraw,
      side: bet.side,
      betCount: bet.pool._count.bets,
      feeBps,
    });
    payout = result.payout.toString();
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
    payoutFailed: bet.payoutFailed ?? false,
    payoutAttempts: bet.payoutAttempts ?? 0,
    lastAttemptedAt: bet.lastAttemptedAt?.toISOString() ?? null,
    createdAt: bet.createdAt.toISOString(),
    pool: {
      id: bet.pool.id,
      poolId: bet.pool.poolId,
      asset: bet.pool.asset,
      interval: bet.pool.interval,
      status: bet.pool.status,
      startTime: bet.pool.startTime.toISOString(),
      endTime: bet.pool.endTime.toISOString(),
      strikePrice: bet.pool.strikePrice?.toString() ?? null,
      finalPrice: bet.pool.finalPrice?.toString() ?? null,
      winner: bet.pool.winner,
      poolType: (bet.pool as any).poolType ?? 'CRYPTO',
      league: (bet.pool as any).league ?? null,
      homeTeam: (bet.pool as any).homeTeam ?? null,
      awayTeam: (bet.pool as any).awayTeam ?? null,
      homeTeamCrest: (bet.pool as any).homeTeamCrest ?? null,
      awayTeamCrest: (bet.pool as any).awayTeamCrest ?? null,
      // Pool totals - exposed so the profile UI can compute a "potential
      // payout at current odds" hint for bets on active pools.
      totalUp: bet.pool.totalUp.toString(),
      totalDown: bet.pool.totalDown.toString(),
      totalDraw: (bet.pool.totalDraw ?? 0n).toString(),
      betCount: bet.pool._count.bets,
    },
  };
}

/* ─── User Profile Serializer ─── */

/**
 * Optional aggregates the /profile route computes from related tables (the User
 * row alone can't supply them). All optional so /register can serialize a fresh
 * user without extra queries.
 *  - totalWon: sum of realized (claimed) winning payouts - matches the squad
 *    leaderboard's netPnl convention (payout - wagered).
 *  - rank / totalUsers: leaderboard position by XP, for the rank chip.
 */
export interface UserProfileExtras {
  totalWon?: bigint;
  rank?: number;
  totalUsers?: number;
  /** Number of refunded bets - pulled out of the Win Rate denominator since
   *  a refund isn't a loss (stake came back to the user). */
  totalRefunded?: number;
  /** Sum of stakes that were refunded. Subtracted from `volumeStaked` so the
   *  Volume Staked tile shows real money put at risk (refunds round-tripped). */
  refundedStake?: bigint;
  /** Stake from settled, non-refund bets only - used as the denominator of
   *  realized P&L. Excludes active stakes (still in play, not lost). */
  realizedStaked?: bigint;
  /** Payout from settled, non-refund bets only (NULL payouts collapse to 0).
   *  Net P&L = realizedWon − realizedStaked. */
  realizedWon?: bigint;
}

export function serializeUserProfile(user: {
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  totalXp: bigint;
  level: number;
  coinsBalance: bigint;
  coinsLifetime: bigint;
  coinsRedeemed: bigint;
  totalBets: number;
  totalWins: number;
  totalWagered: bigint;
  currentStreak: number;
  bestStreak: number;
  referralCode: string | null;
  createdAt: Date;
}, extras: UserProfileExtras = {}) {
  // Derive level from totalXp (the source of truth) instead of trusting the
  // stored `level` column. A concurrent XP write can leave `level` lagging behind
  // `totalXp`; deriving here guarantees the XP bar is always internally consistent
  // and self-heals any already-desynced rows on read - no migration required.
  const level = getLevelForXp(user.totalXp);
  const isMaxLevel = level >= 40;
  return {
    walletAddress: user.walletAddress,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    referralCode: user.referralCode,
    level,
    title: getLevelTitle(level),
    totalXp: user.totalXp.toString(),
    xpForCurrentLevel: getXpForLevel(level).toString(),
    xpForNextLevel: getXpForLevel(level + 1).toString(),
    xpToNextLevel: getXpToNextLevel(level).toString(),
    xpProgress: isMaxLevel
      ? 1
      : Number(user.totalXp - getXpForLevel(level)) /
        Number(getXpToNextLevel(level) || 1n),
    coinsBalance: user.coinsBalance.toString(),
    coinsLifetime: user.coinsLifetime.toString(),
    coinsRedeemed: user.coinsRedeemed.toString(),
    feeBps: getFeeBps(level),
    feePercent: (getFeeBps(level) / 100).toFixed(2),
    coinMultiplier: getLevelMultiplier(level),
    // Perks unlocked at the next level - surfaced so the profile can show the
    // user what progressing actually buys them (lower fee, higher coin rate).
    nextLevel: isMaxLevel ? null : {
      level: level + 1,
      title: getLevelTitle(level + 1),
      feePercent: (getFeeBps(level + 1) / 100).toFixed(2),
      coinMultiplier: getLevelMultiplier(level + 1),
    },
    rank: extras.rank ?? null,
    totalUsers: extras.totalUsers ?? null,
    // 9 unlock milestones rendered as a "Badges"-style strip on the profile
    // overview. Building this server-side keeps the level/fee/multiplier
    // tables in a single source of truth (utils/levels.ts + utils/fees.ts);
    // duplicating the math in the web app drifts the moment a tuning pass
    // touches either side. The frontend only owns the lock/unlock display.
    milestones: ([1, 5, 10, 15, 20, 25, 30, 35, 40] as const).map(lvl => ({
      level: lvl,
      title: getLevelTitle(lvl),
      xpRequired: getXpForLevel(lvl).toString(),
      feePercent: (getFeeBps(lvl) / 100).toFixed(2),
      coinMultiplier: getLevelMultiplier(lvl),
      unlocked: level >= lvl,
    })),
    stats: (() => {
      const refunded = extras.totalRefunded ?? 0;
      // Refunds aren't wins and aren't losses. Excluding them from the
      // denominator gives a Win Rate of what the user actually bets against
      // a real counterparty.
      const settled = Math.max(0, user.totalBets - refunded);
      const refundedStake = extras.refundedStake ?? 0n;
      const realizedStaked = extras.realizedStaked ?? 0n;
      const realizedWon = extras.realizedWon ?? 0n;
      // Volume Staked = lifetime placed minus the round-tripped refund stakes.
      // Active stakes still count (money is currently at risk) but refunds
      // don't (the user got their stake back, no risk taken).
      const volumeStaked =
        user.totalWagered > refundedStake
          ? user.totalWagered - refundedStake
          : 0n;
      // Net P&L = realized winnings − realized stake. By construction this
      // excludes both active (in-play) stakes and refunds - only finalized
      // outcomes move the number.
      const netPnl = realizedWon - realizedStaked;
      return {
        totalBets: user.totalBets,
        totalWins: user.totalWins,
        totalRefunded: refunded,
        winRate: settled > 0
          ? ((user.totalWins / settled) * 100).toFixed(1)
          : '0.0',
        // totalWagered stays as the raw User column (consumed by leaderboards
        // and other places that want gross lifetime placement).
        totalWagered: user.totalWagered.toString(),
        totalWon: (extras.totalWon ?? 0n).toString(),
        volumeStaked: volumeStaked.toString(),
        netPnl: netPnl.toString(),
        currentStreak: user.currentStreak,
        bestStreak: user.bestStreak,
      };
    })(),
    createdAt: user.createdAt.toISOString(),
  };
}
