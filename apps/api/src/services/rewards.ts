import { prisma } from '../db';
import { getLevelForXp, XP_ACTIONS, getXpForLevel } from '../utils/levels';
import {
  calculateCoinsForBet,
  calculateWinBonus,
  calculateStreakBonus,
  calculateLevelUpBonus,
} from '../utils/coins';
import { emitUserReward } from '../websocket';
import { ensureReferralCode } from './referrals';

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

    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { walletAddress },
        data: {
          totalXp: { increment: totalXpAward },
          level: newLevel,
        },
      });

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
  } catch (error) {
    console.error('[Rewards] awardBetResolution failed:', error);
  }
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
