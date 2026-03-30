import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db';
import { getScheduler } from '../../scheduler/pool-scheduler';
import { getConnection, getRpcStats } from '../../utils/solana';
import { PacificaProvider } from 'market-data';
import { getLivescoreMetrics } from '../../services/sports/livescore';

export const adminHealthRouter: RouterType = Router();

adminHealthRouter.get('/overview', async (_req, res) => {
  try {
    const scheduler = getScheduler();
    const status = scheduler.getStatus();
    const connection = getConnection();

    const [rpcLatency, priceHealthy, poolCounts, betCount, userCount, authorityBalance] = await Promise.all([
      // RPC latency
      (async () => {
        const start = Date.now();
        try {
          await connection.getSlot();
          return { ms: Date.now() - start, ok: true };
        } catch {
          return { ms: -1, ok: false };
        }
      })(),
      // Price provider health
      (async () => {
        try {
          const provider = new PacificaProvider();
          return await provider.isHealthy();
        } catch {
          return false;
        }
      })(),
      // Pool status counts
      prisma.pool.groupBy({
        by: ['status'],
        _count: true,
      }),
      // Total bets
      prisma.bet.count(),
      // Total users
      prisma.user.count(),
      // Authority SOL balance
      (async () => {
        try {
          const balance = await connection.getBalance(scheduler.getStatus().authority ? new (await import('@solana/web3.js')).PublicKey(status.authority) : new (await import('@solana/web3.js')).PublicKey('11111111111111111111111111111111'));
          return balance / 1e9;
        } catch {
          return null;
        }
      })(),
    ]);

    const poolStatusMap: Record<string, number> = {};
    for (const row of poolCounts) {
      poolStatusMap[row.status] = row._count;
    }

    // Per-job health
    const jobHealth = scheduler.getJobHealth().map(j => ({
      name: j.name,
      schedule: j.schedule,
      lastRunAt: j.lastRunAt?.toISOString() ?? null,
      lastErrorAt: j.lastErrorAt?.toISOString() ?? null,
      lastError: j.lastError,
      runCount: j.runCount,
      errorCount: j.errorCount,
      healthy: j.lastRunAt !== null && (j.lastErrorAt === null || j.lastRunAt > j.lastErrorAt),
    }));

    // Stuck pool count for quick glance
    const stuckCount = await prisma.pool.count({
      where: {
        status: { in: ['JOINING', 'ACTIVE'] },
        endTime: { lte: new Date() },
      },
    });

    res.json({
      success: true,
      data: {
        scheduler: {
          isRunning: status.isRunning,
          jobCount: status.jobCount,
          authority: status.authority,
        },
        jobs: jobHealth,
        rpc: rpcLatency,
        rpcEndpoints: getRpcStats(),
        priceProvider: { healthy: priceHealthy },
        authorityBalance,
        stuckPools: stuckCount,
        db: {
          pools: poolStatusMap,
          totalBets: betCount,
          totalUsers: userCount,
        },
      },
    });
  } catch (error) {
    console.error('Admin health error:', error);
    res.status(500).json({ success: false, error: { code: 'HEALTH_ERROR', message: 'Failed to fetch health data' } });
  }
});

adminHealthRouter.get('/livescore', async (_req, res) => {
  try {
    const metrics = getLivescoreMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('Admin livescore health error:', error);
    res.status(500).json({ success: false, error: { code: 'LIVESCORE_HEALTH_ERROR', message: 'Failed to fetch livescore metrics' } });
  }
});
