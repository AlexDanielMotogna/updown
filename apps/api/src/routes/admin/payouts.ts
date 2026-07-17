/**
 * Admin endpoints for the auto-payout pipeline.
 *
 * Surface area:
 *  - GET    /admin/payouts/queue              list pending winning bets per pool
 *  - GET    /admin/payouts/failed             list bets with payoutFailed=true
 *  - POST   /admin/payouts/:betId/retry       clear failed flag + immediate retry
 *  - GET    /admin/payouts/migration/preview  dry-run for the one-shot job
 *  - POST   /admin/payouts/migration          execute the migration job
 *  - GET    /admin/payouts/stats              last-24h success/failure metrics
 *  - GET    /admin/wallet/balance             authority SOL + USDC balance
 *
 * All endpoints require x-admin-key (mounted under adminRouter.use(adminAuth)).
 */

import { Router, type Router as RouterType } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db';
import { getConnection, getAuthorityKeypair, getUsdcMint } from '../../utils/solana';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { autoClaimBets } from '../../scheduler/auto-claim';
import { rotateConnection } from '../../utils/solana';
import { PacificaProvider } from 'market-data';
import { ResolverDeps } from '../../scheduler/resolver-types';

export const adminPayoutsRouter: RouterType = Router();
export const adminWalletRouter: RouterType = Router();

// Shared deps helper - mirrors scheduler bootstrap so retries can use the
// same authority wallet + price provider as the cron job.
function buildResolverDeps(): ResolverDeps {
  return {
    prisma,
    connection: getConnection(),
    wallet: getAuthorityKeypair(),
    priceProvider: new PacificaProvider(),
  };
}

// ---------------------------------------------------------------------------
// GET /admin/payouts/queue
// Lists winning bets that have not been paid yet (pending auto-claim) per
// pool. Useful for diagnosing stuck pools.
// ---------------------------------------------------------------------------
adminPayoutsRouter.get('/queue', async (_req, res) => {
  try {
    // Find pools that are CLAIMABLE with at least one unpaid winning bet.
    const pools = await prisma.pool.findMany({
      where: {
        status: 'CLAIMABLE',
        winner: { not: null },
        bets: { some: { claimed: false, payoutFailed: false } },
      },
      select: {
        id: true,
        asset: true,
        poolType: true,
        winner: true,
        homeTeam: true,
        awayTeam: true,
        updatedAt: true,
        _count: { select: { bets: { where: { claimed: false, payoutFailed: false } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    res.json({
      success: true,
      data: pools.map(p => ({
        id: p.id,
        asset: p.asset,
        poolType: p.poolType,
        winner: p.winner,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        pendingCount: p._count.bets,
        updatedAt: p.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[Admin] payouts/queue error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Failed to load queue' } });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/payouts/failed
// Lists bets where the scheduler exhausted its retries. The admin can use
// these to trigger a manual retry once the underlying issue is fixed.
// ---------------------------------------------------------------------------
adminPayoutsRouter.get('/failed', async (_req, res) => {
  try {
    const bets = await prisma.bet.findMany({
      where: { payoutFailed: true, claimed: false },
      orderBy: { lastAttemptedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        poolId: true,
        walletAddress: true,
        side: true,
        amount: true,
        payoutAttempts: true,
        lastAttemptedAt: true,
        pool: {
          select: { asset: true, poolType: true, winner: true, homeTeam: true, awayTeam: true },
        },
      },
    });

    res.json({
      success: true,
      data: bets.map(b => ({
        id: b.id,
        poolId: b.poolId,
        walletAddress: b.walletAddress,
        side: b.side,
        amount: b.amount.toString(),
        attempts: b.payoutAttempts,
        lastAttemptedAt: b.lastAttemptedAt?.toISOString() ?? null,
        pool: b.pool,
      })),
    });
  } catch (error) {
    console.error('[Admin] payouts/failed error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Failed to load failed list' } });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/payouts/:betId/retry
// Clears the failed flag on a single bet and immediately re-runs the
// scheduler's auto-claim path for that bet's pool. The pool-scoped retry
// is safe - it's idempotent against other already-paid bets in the pool.
// ---------------------------------------------------------------------------
adminPayoutsRouter.post('/:betId/retry', async (req, res) => {
  try {
    const betId = req.params.betId;
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: { pool: { select: { id: true, asset: true, poolType: true, winner: true, homeTeam: true, awayTeam: true } } },
    });

    if (!bet) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Bet not found' } });
    }

    if (bet.claimed) {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_CLAIMED', message: 'Bet already paid' } });
    }

    // Reset the failure flag so autoClaimBets picks it up again.
    await prisma.bet.update({
      where: { id: betId },
      data: { payoutFailed: false },
    });

    await prisma.eventLog.create({
      data: {
        eventType: 'ADMIN_PAYOUT_RETRY',
        entityType: 'bet',
        entityId: betId,
        payload: {
          poolId: bet.poolId,
          walletAddress: bet.walletAddress,
          attemptsBefore: bet.payoutAttempts.toString(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    // Fire-and-forget - admin doesn't need to wait for the on-chain confirm.
    const deps = buildResolverDeps();
    autoClaimBets(deps, bet.pool).catch(err => {
      console.error('[Admin] retry autoClaimBets crashed:', err);
    });

    res.json({ success: true, message: 'Retry triggered' });
  } catch (error) {
    console.error('[Admin] payouts/retry error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Failed to trigger retry' } });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/payouts/retry-all
// Clears the failed flag on EVERY outstanding failed winning bet, then kicks off
// auto-claim for each affected pool in the background (sequential, to avoid an RPC
// storm). Fire-and-forget: the request returns immediately with the counts, and
// the scheduler's retry sweep drains anything the background pass doesn't reach.
// ---------------------------------------------------------------------------
adminPayoutsRouter.post('/retry-all', async (_req, res) => {
  try {
    const reset = await prisma.bet.updateMany({
      where: { claimed: false, payoutFailed: true },
      data: { payoutFailed: false },
    });

    const pools = await prisma.pool.findMany({
      where: {
        status: 'CLAIMABLE',
        winner: { not: null },
        bets: { some: { claimed: false, payoutFailed: false } },
      },
      select: { id: true, asset: true, poolType: true, winner: true, homeTeam: true, awayTeam: true },
    });

    await prisma.eventLog.create({
      data: {
        eventType: 'ADMIN_PAYOUT_RETRY_ALL',
        entityType: 'system',
        entityId: 'retry-all',
        payload: {
          reset: reset.count.toString(),
          pools: pools.length.toString(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    const deps = buildResolverDeps();
    void (async () => {
      for (const pool of pools) {
        await autoClaimBets(deps, pool).catch(err => console.error('[Admin] retry-all autoClaimBets crashed:', err));
      }
      console.log(`[Admin] retry-all done: ${pools.length} pool(s) processed`);
    })();

    res.json({ success: true, data: { reset: reset.count, pools: pools.length } });
  } catch (error) {
    console.error('[Admin] payouts/retry-all error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Failed to retry all payouts' } });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/payouts/migration/preview
// Dry-run: counts the bets that the migration job would process. Optionally
// scopes by `withinDays` query param (defaults to 30 days, matching the
// safer rollout default in the plan).
// ---------------------------------------------------------------------------
const previewQuery = z.object({
  withinDays: z.coerce.number().int().min(1).max(365).optional(),
});

adminPayoutsRouter.get('/migration/preview', async (req, res) => {
  try {
    const parsed = previewQuery.safeParse(req.query);
    const withinDays = parsed.success ? (parsed.data.withinDays ?? 30) : 30;
    const cutoff = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);

    const candidates = await prisma.bet.findMany({
      where: {
        claimed: false,
        payoutFailed: false,
        pool: {
          status: 'CLAIMABLE',
          winner: { not: null },
          updatedAt: { gte: cutoff },
        },
      },
      select: {
        id: true,
        poolId: true,
        side: true,
        amount: true,
        pool: { select: { winner: true, asset: true } },
      },
    });

    // Only count winning-side bets (hedger losing-side rows shouldn't migrate).
    const eligible = candidates.filter(b => b.side === b.pool.winner);

    const totalAmount = eligible.reduce((acc, b) => acc + b.amount, BigInt(0));
    const byPool = eligible.reduce<Record<string, number>>((acc, b) => {
      acc[b.poolId] = (acc[b.poolId] ?? 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        withinDays,
        totalBets: eligible.length,
        totalPools: Object.keys(byPool).length,
        totalAmountUsdcRaw: totalAmount.toString(),
        cutoff: cutoff.toISOString(),
      },
    });
  } catch (error) {
    console.error('[Admin] payouts/migration/preview error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Preview failed' } });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/payouts/migration
// Execute the one-shot migration. Iterates pools that satisfy the same
// criteria as the preview and runs autoClaimBets per pool. SSE stream so
// the admin can watch progress.
// ---------------------------------------------------------------------------
const migrationBody = z.object({
  withinDays: z.number().int().min(1).max(365).optional(),
  confirm: z.literal('CONFIRM_MIGRATION'),
});

adminPayoutsRouter.post('/migration', async (req, res) => {
  const parsed = migrationBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Body must include withinDays and confirm: "CONFIRM_MIGRATION"',
      },
    });
  }
  const withinDays = parsed.data.withinDays ?? 30;
  const cutoff = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);

  // Server-sent events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type: string, data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    const pools = await prisma.pool.findMany({
      where: {
        status: 'CLAIMABLE',
        winner: { not: null },
        updatedAt: { gte: cutoff },
        bets: { some: { claimed: false, payoutFailed: false } },
      },
      select: {
        id: true,
        asset: true,
        poolType: true,
        winner: true,
        homeTeam: true,
        awayTeam: true,
      },
    });

    send('start', { totalPools: pools.length, withinDays });

    await prisma.eventLog.create({
      data: {
        eventType: 'ADMIN_PAYOUT_MIGRATION_EXECUTED',
        entityType: 'system',
        entityId: 'migration',
        payload: {
          totalPools: pools.length.toString(),
          withinDays: withinDays.toString(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    const deps = buildResolverDeps();
    let succeeded = 0, failed = 0, skipped = 0;

    for (const pool of pools) {
      try {
        const result = await autoClaimBets(deps, pool);
        succeeded += result.succeeded;
        failed += result.failed;
        skipped += result.skipped;
        send('pool', { poolId: pool.id, asset: pool.asset, ...result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send('pool_error', { poolId: pool.id, error: msg });
      }
    }

    send('done', { succeeded, failed, skipped });
    res.end();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    send('error', { error: msg });
    res.end();
  }
});

// ---------------------------------------------------------------------------
// GET /admin/payouts/stats
// Aggregated metrics for the last 24h plus current outstanding counts.
// ---------------------------------------------------------------------------
adminPayoutsRouter.get('/stats', async (_req, res) => {
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [paidLast24h, failedLast24h, failedOutstanding] = await Promise.all([
      prisma.eventLog.count({
        where: { eventType: 'BET_AUTO_PAID', createdAt: { gte: dayAgo } },
      }),
      prisma.eventLog.count({
        where: { eventType: 'BET_AUTO_PAYOUT_FAILED', createdAt: { gte: dayAgo } },
      }),
      prisma.bet.count({ where: { payoutFailed: true, claimed: false } }),
    ]);

    // Pending = unpaid WINNING-side bets only. Losing bets are never claimed, so
    // the old "any unclaimed bet in a CLAIMABLE pool" count was hugely inflated
    // (it counted every loser too — e.g. 3333 shown vs ~123 real winners pending).
    const pendingPerSide = await Promise.all(
      (['UP', 'DOWN', 'DRAW'] as const).map(side =>
        prisma.bet.count({ where: { side, claimed: false, payoutFailed: false, pool: { status: 'CLAIMABLE', winner: side } } }),
      ),
    );
    const pending = pendingPerSide.reduce((a, b) => a + b, 0);

    const total24h = paidLast24h + failedLast24h;
    const successRate = total24h === 0 ? null : Math.round((paidLast24h / total24h) * 1000) / 10;

    res.json({
      success: true,
      data: {
        last24h: { paid: paidLast24h, failed: failedLast24h, successRate },
        pending,
        failedOutstanding,
      },
    });
  } catch (error) {
    console.error('[Admin] payouts/stats error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Stats failed' } });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/wallet/balance
// Authority SOL + USDC balance (used by the PayoutManagement header card).
// ---------------------------------------------------------------------------
adminWalletRouter.get('/balance', async (_req, res) => {
  try {
    const connection = getConnection();
    const authority = getAuthorityKeypair();
    const sol = await connection.getBalance(authority.publicKey);

    let usdc = '0';
    try {
      const feeWallet = await getAssociatedTokenAddress(getUsdcMint(), authority.publicKey);
      const account = await getAccount(connection, feeWallet);
      usdc = account.amount.toString();
    } catch {
      // USDC ATA may not exist yet - leave at 0.
    }

    res.json({
      success: true,
      data: {
        solLamports: sol.toString(),
        solBalance: (sol / 1e9).toFixed(6),
        usdcRaw: usdc,
        usdcBalance: (Number(usdc) / 1_000_000).toFixed(2),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('429') || msg.includes('Too Many Requests')) rotateConnection();
    console.error('[Admin] wallet/balance error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Balance query failed' } });
  }
});
