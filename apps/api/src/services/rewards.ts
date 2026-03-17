import { prisma } from '../db';
import { getLevelForXp, XP_ACTIONS, getXpForLevel } from '../utils/levels';
import {
  calculateCoinsForBet,
  calculateWinBonus,
  calculateStreakBonus,
  calculateLevelUpBonus,
} from '../utils/coins';
import { emitUserReward } from '../websocket';

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
  return prisma.user.upsert({
    where: { walletAddress },
    update: {},
    create: { walletAddress },
  });
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
 * Award XP when a bet is placed (after confirm-deposit).
 * Coins are NOT awarded here  only after pool resolution (in awardBetWin).
 * Fire-and-forget  errors logged but never thrown.
 */
export async function awardBetPlacement(
  walletAddress: string,
  betAmountRaw: bigint,
): Promise<void> {
  try {
    let user = await ensureDailyReset(walletAddress);
    if (!user) user = await registerUser(walletAddress);

    const isFirstBetToday = user.dailyBetCount === 0;
    const xpBase = XP_ACTIONS.BET_PLACED;
    const xpDaily = isFirstBetToday ? XP_ACTIONS.DAILY_FIRST_BET : 0n;
    const totalXpAward = xpBase + xpDaily;

    const newTotalXp = user.totalXp + totalXpAward;
    const newLevel = getLevelForXp(newTotalXp);
    const didLevelUp = newLevel > user.level;

    // Atomic update  XP only, no coins
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { walletAddress },
        data: {
          totalXp: { increment: totalXpAward },
          level: newLevel,
          totalBets: { increment: 1 },
          totalWagered: { increment: betAmountRaw },
          dailyBetCount: { increment: 1 },
          lastActiveDate: new Date(),
        },
      });

      // Log XP
      await tx.rewardLog.create({
        data: {
          walletAddress,
          rewardType: 'XP',
          reason: 'BET_PLACED',
          amount: totalXpAward,
          metadata: { betAmount: betAmountRaw.toString(), isFirstBetToday },
        },
      });

      // Log level-up
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

      // Daily bonus log
      if (isFirstBetToday) {
        await tx.rewardLog.create({
          data: {
            walletAddress,
            rewardType: 'XP',
            reason: 'DAILY_BONUS',
            amount: xpDaily,
          },
        });
      }
    });

    // Emit WS reward event  XP only
    emitUserReward(walletAddress, {
      xp: Number(totalXpAward),
      coins: 0,
      level: newLevel,
      levelUp: didLevelUp,
      totalXp: Number(newTotalXp),
      xpToNextLevel: Number(getXpForLevel(newLevel + 1) - newTotalXp),
    });
  } catch (error) {
    console.error('[Rewards] awardBetPlacement failed:', error);
  }
}

/**
 * Award XP + coins when a bet is won (called during claim).
 * This is where ALL coins are awarded  base bet coins + win bonus + streak + level-up.
 * Coins are only given here (after pool resolution) to prevent rewarding refunded pools.
 */
export async function awardBetWin(
  walletAddress: string,
  betAmountRaw: bigint,
): Promise<void> {
  try {
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
    const newLevel = getLevelForXp(newTotalXp);
    const didLevelUp = newLevel > user.level;

    let levelUpCoins = 0n;
    if (didLevelUp) {
      levelUpCoins = calculateLevelUpBonus(newLevel, user.dailyCoins + betCoins + winCoins + streakCoins);
    }

    const totalCoins = betCoins + winCoins + streakCoins + levelUpCoins;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
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

      await tx.rewardLog.create({
        data: {
          walletAddress,
          rewardType: 'XP',
          reason: 'BET_WON',
          amount: totalXpAward,
          metadata: { streak: newStreak },
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
    const newLevel = getLevelForXp(newTotalXp);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { walletAddress },
        data: {
          totalXp: { increment: xp },
          level: newLevel,
        },
      });

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
