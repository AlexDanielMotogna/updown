import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { registerUser } from '../services/rewards';
import { getLevelTitle } from '../utils/levels';
import { serializeUserProfile } from '../utils/serializers';

export const usersRouter: RouterType = Router();

const walletSchema = z.object({
  walletAddress: z.string().min(32).max(44),
});

const profileQuerySchema = z.object({
  wallet: z.string().min(32).max(44),
});

const rewardHistorySchema = z.object({
  wallet: z.string().min(32).max(44),
  type: z.enum(['XP', 'COINS']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const leaderboardSchema = z.object({
  sort: z.enum(['xp', 'coins', 'level']).default('xp'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Self-edit profile fields. The wallet address authorises the call (same
// pattern as the rest of this router). Display name is a-zA-Z0-9 + dash/
// underscore + space, 3-20 chars; rejecting whitespace-only avoids the
// "  " username trick. URLs must be https Cloudinary or generic https links;
// we don't render anything fancy with them so a soft check is enough — the
// MVP explicitly opted out of moderation.
const profileUpdateSchema = z.object({
  walletAddress: z.string().min(32).max(44),
  displayName: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9 _-]+$/, 'Letters, numbers, space, _ or - only')
    .nullable()
    .optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  bannerUrl: z.string().url().max(500).nullable().optional(),
});

/**
 * POST /api/users/register
 * Upsert a user on wallet connect.
 */
usersRouter.post('/register', async (req, res) => {
  try {
    const parsed = walletSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid wallet address' },
      });
    }

    const user = await registerUser(parsed.data.walletAddress);

    res.json({
      success: true,
      data: serializeUserProfile(user),
    });
  } catch (error) {
    console.error('[Users] register error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to register user' },
    });
  }
});

/**
 * GET /api/users/profile?wallet=
 * Return full user profile.
 */
usersRouter.get('/profile', async (req, res) => {
  try {
    const parsed = profileQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'wallet query parameter required' },
      });
    }

    const user = await prisma.user.findUnique({
      where: { walletAddress: parsed.data.wallet },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    // Aggregates the User row can't supply: realized winnings (for Net P&L),
    // the user's rank by XP, and refunded-bet count (used to drop refunds
    // out of the Win Rate denominator - they didn't lose, they got their
    // stake back).
    const [wonAgg, higherXpCount, totalUsers, refundedRows, realizedRows] = await Promise.all([
      prisma.bet.aggregate({
        _sum: { payoutAmount: true },
        where: { walletAddress: user.walletAddress, payoutAmount: { not: null } },
      }),
      prisma.user.count({ where: { totalXp: { gt: user.totalXp } } }),
      prisma.user.count(),
      // Refund = claimed bet whose on-chain payout equals the original stake.
      // Both autoRefundBets and the single-bettor / one-sided / hedger paths
      // write payout_amount = amount, so a column-to-column comparison is the
      // canonical test. Prisma's findMany can't express that directly, hence
      // raw. SUM(amount) feeds back the dollars that came back to the user -
      // we subtract them from the Volume Staked tile so refunds don't inflate
      // the lifetime-staked number (the money round-tripped, no risk taken).
      prisma.$queryRaw<Array<{ count: bigint; stake: bigint }>>`
        SELECT
          COUNT(*)::bigint AS count,
          COALESCE(SUM(amount), 0)::bigint AS stake
        FROM bets
        WHERE wallet_address = ${user.walletAddress}
          AND claimed = TRUE
          AND payout_amount IS NOT NULL
          AND payout_amount = amount
      `,
      // Realized P&L: settled non-refund bets only. We deliberately exclude
      //  - active bets (pool not yet resolved) - stake is still in play, not lost
      //  - refunds - stake came back, net 0
      // and include:
      //  - claimed wins (payout_amount > amount) → +(payout - stake)
      //  - determined losses (pool.winner set & != bet.side) → -stake
      //  - pending wins where payout was already written by auto-claim
      // Net = SUM(payout_amount) − SUM(amount). NULL payouts (losses, pending)
      // collapse to 0 in the COALESCE, so they correctly contribute -stake.
      prisma.$queryRaw<Array<{ staked: bigint; won: bigint }>>`
        SELECT
          COALESCE(SUM(b.amount), 0)::bigint AS staked,
          COALESCE(SUM(COALESCE(b.payout_amount, 0)), 0)::bigint AS won
        FROM bets b
        JOIN pools p ON p.id = b.pool_id
        WHERE b.wallet_address = ${user.walletAddress}
          AND NOT (b.payout_amount IS NOT NULL AND b.payout_amount = b.amount)
          AND (
            b.claimed = TRUE
            OR (p.winner IS NOT NULL AND p.winner <> b.side)
          )
      `,
    ]);
    const totalRefunded = Number(refundedRows[0]?.count ?? 0n);
    const refundedStake = refundedRows[0]?.stake ?? 0n;
    const realizedStaked = realizedRows[0]?.staked ?? 0n;
    const realizedWon = realizedRows[0]?.won ?? 0n;

    res.json({
      success: true,
      data: serializeUserProfile(user, {
        totalWon: wonAgg._sum.payoutAmount ?? 0n,
        rank: higherXpCount + 1,
        totalUsers,
        totalRefunded,
        refundedStake,
        realizedStaked,
        realizedWon,
      }),
    });
  } catch (error) {
    console.error('[Users] profile error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch profile' },
    });
  }
});

/**
 * GET /api/users/rewards?wallet=&type=&page=&limit=
 * Reward history with pagination.
 */
usersRouter.get('/rewards', async (req, res) => {
  try {
    const parsed = rewardHistorySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' },
      });
    }

    const { wallet, type, page, limit } = parsed.data;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { walletAddress: wallet };
    if (type) where.rewardType = type;

    const [rewards, total] = await Promise.all([
      prisma.rewardLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.rewardLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: rewards.map((r) => ({
        id: r.id,
        type: r.rewardType,
        reason: r.reason,
        amount: r.amount.toString(),
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[Users] rewards error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch rewards' },
    });
  }
});

/**
 * GET /api/users/category-stats?wallet=
 * Per-category performance breakdown (Crypto / Sports / each PM_* category),
 * aggregated over all of the user's bets. Mirrors the profile History filter
 * buckets so the Overview matches what the user can drill into.
 */
usersRouter.get('/category-stats', async (req, res) => {
  try {
    const parsed = profileQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'wallet query parameter required' },
      });
    }

    const bets = await prisma.bet.findMany({
      where: { walletAddress: parsed.data.wallet },
      select: {
        side: true,
        amount: true,
        payoutAmount: true,
        pool: { select: { poolType: true, league: true, winner: true } },
      },
    });

    type Agg = { bets: number; wins: number; wagered: bigint; won: bigint };
    const map = new Map<string, Agg>();
    for (const b of bets) {
      const league = b.pool.league ?? '';
      const category =
        b.pool.poolType !== 'SPORTS' ? 'CRYPTO'
        : league.startsWith('PM_') ? league
        : 'SPORTS';
      const agg = map.get(category) ?? { bets: 0, wins: 0, wagered: 0n, won: 0n };
      agg.bets++;
      agg.wagered += b.amount;
      if (b.pool.winner && b.pool.winner === b.side) {
        agg.wins++;
        if (b.payoutAmount) agg.won += b.payoutAmount;
      }
      map.set(category, agg);
    }

    const data = [...map.entries()]
      .map(([category, a]) => ({
        category,
        bets: a.bets,
        wins: a.wins,
        winRate: a.bets > 0 ? ((a.wins / a.bets) * 100).toFixed(0) : '0',
        wagered: a.wagered.toString(),
        won: a.won.toString(),
      }))
      .sort((x, y) => y.bets - x.bets);

    res.json({ success: true, data });
  } catch (error) {
    console.error('[Users] category-stats error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch category stats' },
    });
  }
});

/**
 * GET /api/users/leaderboard?sort=xp|coins|level&page=&limit=
 */
/**
 * PATCH /api/users/profile
 * Self-edit displayName / avatarUrl / bannerUrl on the user's own row.
 * The walletAddress in the body is the auth signal — same convention as
 * /register and /profile. We pass each field through as undefined when
 * omitted so partial updates don't blank the others; explicit null clears.
 */
usersRouter.patch('/profile', async (req, res) => {
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: first?.message ?? 'Invalid input' },
      });
    }
    const { walletAddress, displayName, avatarUrl, bannerUrl } = parsed.data;

    // Pre-check uniqueness on displayName. Doing this before the update gives
    // a clean 409 instead of letting Prisma throw P2002 — easier UX on the
    // client because we can return the exact field that collided.
    if (displayName) {
      const existing = await prisma.user.findUnique({
        where: { displayName },
        select: { walletAddress: true },
      });
      if (existing && existing.walletAddress !== walletAddress) {
        return res.status(409).json({
          success: false,
          error: { code: 'DISPLAY_NAME_TAKEN', message: 'That display name is already taken' },
        });
      }
    }

    const updated = await prisma.user.update({
      where: { walletAddress },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(bannerUrl !== undefined && { bannerUrl }),
      },
    });

    res.json({ success: true, data: serializeUserProfile(updated) });
  } catch (error) {
    console.error('[Users] profile update error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update profile' },
    });
  }
});

usersRouter.get('/leaderboard', async (req, res) => {
  try {
    const parsed = leaderboardSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' },
      });
    }

    const { sort, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const orderBy: Record<string, 'desc'> =
      sort === 'coins' ? { coinsLifetime: 'desc' }
      : sort === 'level' ? { level: 'desc' }
      : { totalXp: 'desc' };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: [orderBy, { createdAt: 'asc' }], // tie-break by oldest
        skip,
        take: limit,
      }),
      prisma.user.count(),
    ]);

    res.json({
      success: true,
      data: users.map((u, i) => ({
        rank: skip + i + 1,
        walletAddress: u.walletAddress,
        // displayName + avatarUrl let the leaderboard render the user's
        // chosen identity instead of a truncated wallet/gradient pair.
        // Both stay null when the user hasn't customised them, so the
        // client keeps its existing wallet/gradient fallbacks.
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        level: u.level,
        title: getLevelTitle(u.level),
        totalXp: u.totalXp.toString(),
        coinsLifetime: u.coinsLifetime.toString(),
        totalBets: u.totalBets,
        totalWins: u.totalWins,
        bestStreak: u.bestStreak,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[Users] leaderboard error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch leaderboard' },
    });
  }
});

