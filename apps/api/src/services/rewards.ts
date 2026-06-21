import { prisma } from '../db';
import { getLevelForXp, XP_ACTIONS, getXpForLevel, tradeXpForFill } from '../utils/levels';
import {
  calculateCoinsForBet,
  calculateCoinsForTrade,
  calculateWinBonus,
  calculateStreakBonus,
  calculateLevelUpBonus,
} from '../utils/coins';
import { emitUserReward } from '../websocket';
import { ensureReferralCode } from './referrals';
import { checkAndDistributeMilestones } from './milestones';
import { TESTING_MODE, ACTIVE_BET_THRESHOLD, BET_MILESTONE_REWARD, BET_MILESTONE_TYPE, REFERRER_REWARD, REFERRER_REWARD_TYPE } from '../utils/testing';

/** Check if two dates are the same calendar day (UTC). */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Get or create a User record (upsert on wallet connect).
 */
export async function registerUser(walletAddress: string) {
  let user;
  try {
    user = await prisma.user.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress },
    });
  } catch (err: unknown) {
    // Race condition: another request created the user between our check and insert
    if ((err as { code?: string }).code === 'P2002') {
      user = await prisma.user.findUniqueOrThrow({ where: { walletAddress } });
    } else {
      throw err;
    }
  }

  // Generate referral code if missing (fire-and-forget)
  ensureReferralCode(walletAddress).catch((err) =>
    console.error('[Rewards] ensureReferralCode failed:', err),
  );

  // A new signup may have just crossed a community-milestone target.
  checkAndDistributeMilestones().catch((err) =>
    console.error('[Rewards] milestone check failed:', err),
  );

  return user;
}

/**
 * Reset daily counters if the last reset was not today.
 */
async function ensureDailyReset(walletAddress: string) {
  const user = await prisma.user.findUnique({ where: { walletAddress } });
  if (!user) return null;

  const now = new Date();
  if (!user.dailyResetDate || !isSameDay(user.dailyResetDate, now)) {
    return prisma.user.update({
      where: { walletAddress },
      data: {
        dailyBetCount: 0,
        dailyCoins: 0n,
        dailyResetDate: now,
      },
    });
  }
  return user;
}

/**
 * Track bet-placement STATS when a bet is placed (after confirm-deposit).
 * Intentionally awards NO XP and NO coins here - both are granted only when the
 * pool resolves normally (awardBetResolution / awardBetWin).
 *
 * Why: awarding XP at deposit time was farmable. XP had no minimum bet and no
 * daily cap, and one-sided / single-bettor pools get fully auto-refunded - so a
 * user could place dust bets in pools that will be refunded, recover the full
 * stake, and keep the XP for free. Deferring XP to normal resolution means you
 * only earn it after a real two-sided contest. Fire-and-forget.
 */
export async function trackBetPlacement(
  walletAddress: string,
  betAmountRaw: bigint,
): Promise<void> {
  try {
    let user = await ensureDailyReset(walletAddress);
    if (!user) user = await registerUser(walletAddress);

    // Stats only. dailyBetCount feeds the coin diminishing-returns tiers at claim
    // (calculateCoinsForBet), so it still increments per placement.
    await prisma.user.update({
      where: { walletAddress },
      data: {
        totalBets: { increment: 1 },
        totalWagered: { increment: betAmountRaw },
        dailyBetCount: { increment: 1 },
        lastActiveDate: new Date(),
      },
    });
  } catch (error) {
    console.error('[Rewards] trackBetPlacement failed:', error);
  }
}

/**
 * Award participation XP when a pool resolves NORMALLY - both sides had bets and
 * a real winner was decided. Called once per bettor (winner OR loser) from the
 * resolver. It is deliberately NOT called for refunded one-sided / single-bettor /
 * empty pools, which is exactly what makes XP unfarmable.
 *
 * Grants BET_PLACED XP plus a once-per-UTC-day first-bet bonus. Coins and win XP
 * are handled separately at claim (awardBetWin). Fire-and-forget.
 */
export async function awardBetResolution(walletAddress: string): Promise<void> {
  try {
    let user = await ensureDailyReset(walletAddress);
    if (!user) user = await registerUser(walletAddress);

    // Daily first-bet bonus: granted once per UTC day, on the first bet that
    // resolves that day. Tracked via rewardLog so no schema change is needed.
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const dailyAlreadyGranted = await prisma.rewardLog.findFirst({
      where: { walletAddress, reason: 'DAILY_BONUS', createdAt: { gte: startOfDay } },
      select: { id: true },
    });
    const xpDaily = dailyAlreadyGranted ? 0n : XP_ACTIONS.DAILY_FIRST_BET;
    const totalXpAward = XP_ACTIONS.BET_PLACED + xpDaily;

    const newTotalXp = user.totalXp + totalXpAward;
    let newLevel = getLevelForXp(newTotalXp);
    let didLevelUp = newLevel > user.level;
    let newSettledBets = user.settledBets;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { walletAddress },
        data: {
          totalXp: { increment: totalXpAward },
          level: newLevel,
          // Farm-proof activity counter — only real resolutions reach here.
          settledBets: { increment: 1 },
        },
      });
      newSettledBets = updated.settledBets;

      // Reconcile level against the authoritative post-increment XP total (same
      // pattern as the claim/referral awards) to avoid the stored level lagging
      // behind totalXp under concurrent awards.
      const reconciledLevel = getLevelForXp(updated.totalXp);
      if (reconciledLevel !== newLevel) {
        didLevelUp = reconciledLevel > user.level;
        newLevel = reconciledLevel;
        await tx.user.update({ where: { walletAddress }, data: { level: reconciledLevel } });
      }

      await tx.rewardLog.create({
        data: {
          walletAddress,
          rewardType: 'XP',
          reason: 'BET_PLACED',
          amount: XP_ACTIONS.BET_PLACED,
        },
      });

      if (xpDaily > 0n) {
        await tx.rewardLog.create({
          data: {
            walletAddress,
            rewardType: 'XP',
            reason: 'DAILY_BONUS',
            amount: xpDaily,
          },
        });
      }

      if (didLevelUp) {
        await tx.rewardLog.create({
          data: {
            walletAddress,
            rewardType: 'XP',
            reason: 'LEVEL_UP',
            amount: 0n,
            metadata: { oldLevel: user.level, newLevel },
          },
        });
      }
    });

    emitUserReward(walletAddress, {
      xp: Number(totalXpAward),
      coins: 0,
      level: newLevel,
      levelUp: didLevelUp,
      totalXp: Number(newTotalXp),
      xpToNextLevel: Number(getXpForLevel(newLevel + 1) - newTotalXp),
    });

    // Testing campaign: one-time 1000 UP at 20 real resolutions, plus the
    // referrer's reward once this user is "activated". Both idempotent.
    grantBetMilestoneReward(walletAddress, newSettledBets)
      .catch(e => console.warn('[Rewards] bet-milestone grant failed:', e instanceof Error ? e.message : e));
    grantReferrerReward(walletAddress, newSettledBets)
      .catch(e => console.warn('[Rewards] referrer grant failed:', e instanceof Error ? e.message : e));
  } catch (error) {
    console.error('[Rewards] awardBetResolution failed:', error);
  }
}

/** A normalized HyperLiquid fill for trading-XP crediting. */
export interface TradeFillInput {
  tid: bigint;
  coin: string;
  side: 'BUY' | 'SELL';
  px: string;
  sz: string;
  feeUsd: number;
  notionalUsd: number;
  pnlUsd?: number | null;
  dir?: string | null;
  time: number;
}

export interface AwardTradeFillsResult {
  newFills: number;
  xpAwarded: bigint;
  coinsAwarded: bigint;
  newLevel: number;
  levelUp: boolean;
}

/**
 * Credit trading XP from HyperLiquid fills (volume-based, maker/taker-weighted via
 * fee). Persists each fill in `trade_fills` (unique `tid` → idempotent: re-runs
 * skip already-stored fills), increments the user's unified `totalXp`/`level`, and
 * logs one TRADE_VOLUME RewardLog. Farm-proof: XP only ever from real fills, once
 * each. See docs/PLAN-TRADING-XP.md.
 */
export async function awardTradeFills(
  walletAddress: string,
  accountAddress: string,
  fills: TradeFillInput[],
): Promise<AwardTradeFillsResult> {
  const empty: AwardTradeFillsResult = { newFills: 0, xpAwarded: 0n, coinsAwarded: 0n, newLevel: 0, levelUp: false };
  if (fills.length === 0) return empty;

  try {
    // Skip fills we've already stored (idempotency by exchange fill id).
    const tids = fills.map((f) => f.tid);
    const existing = await prisma.tradeFill.findMany({
      where: { tid: { in: tids } },
      select: { tid: true },
    });
    const seen = new Set(existing.map((e) => e.tid));
    const fresh = fills.filter((f) => !seen.has(f.tid));
    if (fresh.length === 0) return empty;

    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) return empty;

    let xpAward = 0n;
    let coinsAward = 0n;
    const rows = fresh.map((f) => {
      const xp = tradeXpForFill(f.feeUsd);
      xpAward += xp;
      coinsAward += calculateCoinsForTrade(f.notionalUsd, user.level);
      return {
        walletAddress,
        accountAddress: accountAddress.toLowerCase(),
        tid: f.tid,
        coin: f.coin,
        side: f.side,
        px: f.px,
        sz: f.sz,
        notionalUsd: String(f.notionalUsd),
        feeUsd: String(f.feeUsd),
        pnlUsd: f.pnlUsd == null ? null : String(f.pnlUsd),
        dir: f.dir ?? null,
        xpAwarded: xp,
        time: BigInt(Math.round(f.time)),
      };
    });

    const newTotalXp = user.totalXp + xpAward;
    const newLevel = getLevelForXp(newTotalXp);
    const levelUp = newLevel > user.level;
    const totalNotional = fresh.reduce((s, f) => s + f.notionalUsd, 0);
    const totalFee = fresh.reduce((s, f) => s + Math.max(0, f.feeUsd), 0);

    await prisma.$transaction(async (tx) => {
      // createMany with skipDuplicates guards a concurrent poller racing on tid.
      await tx.tradeFill.createMany({ data: rows, skipDuplicates: true });
      if (xpAward > 0n || coinsAward > 0n) {
        await tx.user.update({
          where: { walletAddress },
          data: {
            totalXp: { increment: xpAward },
            level: newLevel,
            coinsBalance: { increment: coinsAward },
            coinsLifetime: { increment: coinsAward },
          },
        });
        if (xpAward > 0n) {
          await tx.rewardLog.create({
            data: {
              walletAddress,
              rewardType: 'XP',
              reason: 'TRADE_VOLUME',
              amount: xpAward,
              metadata: { fills: fresh.length, totalNotional, totalFee, tids: tids.map(String) },
            },
          });
        }
        if (coinsAward > 0n) {
          await tx.rewardLog.create({
            data: {
              walletAddress,
              rewardType: 'COINS',
              reason: 'TRADE_VOLUME',
              amount: coinsAward,
              metadata: { fills: fresh.length, totalNotional },
            },
          });
        }
      }
    });

    if (xpAward > 0n || coinsAward > 0n) {
      emitUserReward(walletAddress, {
        xp: Number(xpAward),
        coins: Number(coinsAward),
        level: newLevel,
        levelUp,
        totalXp: Number(newTotalXp),
        xpToNextLevel: Number(getXpForLevel(newLevel + 1) - newTotalXp),
      });
    }

    return { newFills: fresh.length, xpAwarded: xpAward, coinsAwarded: coinsAward, newLevel, levelUp };
  } catch (error) {
    console.error('[Rewards] awardTradeFills failed:', error);
    return empty;
  }
}

/**
 * Pay the referrer once their referred user becomes activated (reaches the
 * 20-bet threshold). One reward per referred wallet (idempotent). Skips
 * referrals flagged suspect by the anti-cheat system.
 */
export async function grantReferrerReward(referredWallet: string, referredSettledBets: number): Promise<void> {
  if (!TESTING_MODE || referredSettledBets < ACTIVE_BET_THRESHOLD) return;
  const ref = await prisma.referral.findUnique({
    where: { referredWallet },
    select: { referrerWallet: true, suspect: true },
  });
  if (!ref) return;
  if (ref.suspect) return; // flagged by anti-cheat — no referrer reward
  const type = `${REFERRER_REWARD_TYPE}:${referredWallet}`;
  try {
    await prisma.rewardGrant.create({
      data: { walletAddress: ref.referrerWallet, type, amount: REFERRER_REWARD, meta: { referredWallet } },
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return; // already rewarded for this referral
    throw e;
  }
  const u = await prisma.user.update({
    where: { walletAddress: ref.referrerWallet },
    data: {
      coinsBalance: { increment: REFERRER_REWARD },
      coinsLifetime: { increment: REFERRER_REWARD },
    },
  });
  await prisma.eventLog.create({
    data: {
      eventType: 'REWARD_REFERRAL_ACTIVATED',
      entityType: 'user',
      entityId: ref.referrerWallet,
      payload: { referredWallet, amount: REFERRER_REWARD.toString() },
    },
  }).catch(() => { /* best-effort audit */ });
  emitUserReward(ref.referrerWallet, {
    xp: 0,
    coins: Number(REFERRER_REWARD),
    level: u.level,
    levelUp: false,
    totalXp: Number(u.totalXp),
    xpToNextLevel: Number(getXpForLevel(u.level + 1) - u.totalXp),
    reason: 'referral_activated',
  });
}

/**
 * Grant the one-time 20-bet UP reward once the wallet hits ACTIVE_BET_THRESHOLD
 * real resolutions. Idempotent via the unique RewardGrant (wallet, type) —
 * safe to call on every resolution.
 */
export async function grantBetMilestoneReward(walletAddress: string, settledBets: number): Promise<void> {
  if (!TESTING_MODE || settledBets < ACTIVE_BET_THRESHOLD) return;
  try {
    await prisma.rewardGrant.create({
      data: { walletAddress, type: BET_MILESTONE_TYPE, amount: BET_MILESTONE_REWARD },
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return; // already granted
    throw e;
  }
  const u = await prisma.user.update({
    where: { walletAddress },
    data: {
      coinsBalance: { increment: BET_MILESTONE_REWARD },
      coinsLifetime: { increment: BET_MILESTONE_REWARD },
    },
  });
  await prisma.eventLog.create({
    data: {
      eventType: 'REWARD_BET_MILESTONE',
      entityType: 'user',
      entityId: walletAddress,
      payload: { amount: BET_MILESTONE_REWARD.toString(), settledBets },
    },
  }).catch(() => { /* best-effort audit */ });
  emitUserReward(walletAddress, {
    xp: 0,
    coins: Number(BET_MILESTONE_REWARD),
    level: u.level,
    levelUp: false,
    totalXp: Number(u.totalXp),
    xpToNextLevel: Number(getXpForLevel(u.level + 1) - u.totalXp),
    reason: 'bet_milestone',
  });
}

/**
 * Award XP + coins when a bet is won (called during claim).
 * This is where ALL coins are awarded  base bet coins + win bonus + streak + level-up.
 * Coins are only given here (after pool resolution) to prevent rewarding refunded pools.
 *
 * Idempotency: when `betId` is passed (auto-claim path), this checks for an
 * existing BET_WON reward_log entry tied to that bet and short-circuits if
 * one is found. This guards against:
 *   - the auto-claim job retrying after a partial failure;
 *   - a manual claim landing concurrently with the scheduler;
 *   - the optimistic lock allowing two writers to think they each won.
 * Manual-claim callers (the legacy confirm-claim route) still pass no
 * betId and behave exactly as before.
 */
export async function awardBetWin(
  walletAddress: string,
  betAmountRaw: bigint,
  betId?: string,
): Promise<void> {
  try {
    if (betId) {
      const existing = await prisma.rewardLog.findFirst({
        where: {
          walletAddress,
          reason: 'BET_WON',
          rewardType: 'XP',
          metadata: { path: ['betId'], equals: betId },
        },
        select: { id: true },
      });
      if (existing) {
        console.log(`[Rewards] awardBetWin: bet ${betId} already rewarded, skipping`);
        return;
      }
    }

    let user = await ensureDailyReset(walletAddress);
    if (!user) user = await registerUser(walletAddress);

    // Update streak
    const newStreak = user.currentStreak + 1;
    const bestStreak = Math.max(newStreak, user.bestStreak);

    const xpWin = XP_ACTIONS.BET_WON;
    const xpStreak = XP_ACTIONS.winStreakBonus(newStreak);
    const totalXpAward = xpWin + xpStreak;

    // Base coins for the bet (moved here from awardBetPlacement)
    const betCoins = calculateCoinsForBet(
      betAmountRaw,
      user.level,
      user.dailyBetCount,
      user.dailyCoins,
    );
    // Win bonus on top
    const winCoins = calculateWinBonus(betAmountRaw, user.level, user.dailyCoins + betCoins);
    const streakCoins = calculateStreakBonus(newStreak, user.dailyCoins + betCoins + winCoins);

    const newTotalXp = user.totalXp + totalXpAward;
    let newLevel = getLevelForXp(newTotalXp);
    let didLevelUp = newLevel > user.level;

    let levelUpCoins = 0n;
    if (didLevelUp) {
      levelUpCoins = calculateLevelUpBonus(newLevel, user.dailyCoins + betCoins + winCoins + streakCoins);
    }

    const totalCoins = betCoins + winCoins + streakCoins + levelUpCoins;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { walletAddress },
        data: {
          totalXp: { increment: totalXpAward },
          level: newLevel,
          coinsBalance: { increment: totalCoins },
          coinsLifetime: { increment: totalCoins },
          totalWins: { increment: 1 },
          currentStreak: newStreak,
          bestStreak,
          dailyCoins: { increment: totalCoins },
        },
      });

      // Reconcile level against the authoritative post-increment XP total so the
      // stored level never lags behind totalXp under concurrent awards.
      const reconciledLevel = getLevelForXp(updated.totalXp);
      if (reconciledLevel !== newLevel) {
        didLevelUp = reconciledLevel > user.level;
        newLevel = reconciledLevel;
        await tx.user.update({ where: { walletAddress }, data: { level: reconciledLevel } });
      }

      await tx.rewardLog.create({
        data: {
          walletAddress,
          rewardType: 'XP',
          reason: 'BET_WON',
          amount: totalXpAward,
          metadata: { streak: newStreak, ...(betId ? { betId } : {}) },
        },
      });

      // Log base bet coins
      if (betCoins > 0n) {
        await tx.rewardLog.create({
          data: {
            walletAddress,
            rewardType: 'COINS',
            reason: 'BET_PLACED',
            amount: betCoins,
            metadata: { betAmount: betAmountRaw.toString() },
          },
        });
      }

      // Log win bonus coins
      if (winCoins > 0n) {
        await tx.rewardLog.create({
          data: {
            walletAddress,
            rewardType: 'COINS',
            reason: 'BET_WON',
            amount: winCoins,
          },
        });
      }

      if (streakCoins > 0n) {
        await tx.rewardLog.create({
          data: {
            walletAddress,
            rewardType: 'COINS',
            reason: 'WIN_STREAK',
            amount: streakCoins,
            metadata: { streak: newStreak },
          },
        });
      }

      if (xpStreak > 0n) {
        await tx.rewardLog.create({
          data: {
            walletAddress,
            rewardType: 'XP',
            reason: 'WIN_STREAK',
            amount: xpStreak,
            metadata: { streak: newStreak },
          },
        });
      }

      if (didLevelUp && levelUpCoins > 0n) {
        await tx.rewardLog.create({
          data: {
            walletAddress,
            rewardType: 'COINS',
            reason: 'LEVEL_UP',
            amount: levelUpCoins,
            metadata: { newLevel },
          },
        });
      }
    });

    emitUserReward(walletAddress, {
      xp: Number(totalXpAward),
      coins: Number(totalCoins),
      level: newLevel,
      levelUp: didLevelUp,
      totalXp: Number(newTotalXp),
      xpToNextLevel: Number(getXpForLevel(newLevel + 1) - newTotalXp),
      streak: newStreak,
    });
  } catch (error) {
    console.error('[Rewards] awardBetWin failed:', error);
  }
}

/**
 * Award XP when a claim is completed.
 */
export async function awardClaimCompleted(walletAddress: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) return;

    const xp = XP_ACTIONS.CLAIM_COMPLETED;
    const newTotalXp = user.totalXp + xp;
    let newLevel = getLevelForXp(newTotalXp);

    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { walletAddress },
        data: {
          totalXp: { increment: xp },
          level: newLevel,
        },
      });

      // Reconcile level against the authoritative post-increment XP total so the
      // stored level never lags behind totalXp under concurrent awards.
      const reconciledLevel = getLevelForXp(updated.totalXp);
      if (reconciledLevel !== newLevel) {
        newLevel = reconciledLevel;
        await tx.user.update({ where: { walletAddress }, data: { level: reconciledLevel } });
      }

      await tx.rewardLog.create({
        data: {
          walletAddress,
          rewardType: 'XP',
          reason: 'CLAIM_COMPLETED',
          amount: xp,
        },
      });
    });

    emitUserReward(walletAddress, {
      xp: Number(xp),
      coins: 0,
      level: newLevel,
      levelUp: newLevel > user.level,
      totalXp: Number(newTotalXp),
      xpToNextLevel: Number(getXpForLevel(newLevel + 1) - newTotalXp),
    });
  } catch (error) {
    console.error('[Rewards] awardClaimCompleted failed:', error);
  }
}

/**
 * Reset streak when a user loses a bet.
 */
export async function resetStreak(walletAddress: string): Promise<void> {
  try {
    await prisma.user.updateMany({
      where: { walletAddress, currentStreak: { gt: 0 } },
      data: { currentStreak: 0 },
    });
  } catch (error) {
    console.error('[Rewards] resetStreak failed:', error);
  }
}
