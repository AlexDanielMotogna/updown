import { Router, type Router as RouterType } from 'express';
import { PublicKey } from '@solana/web3.js';
import { prisma } from '../../db';
import { getScheduler } from '../../scheduler/pool-scheduler';
import { getConnection } from '../../utils/solana';
import { PacificaProvider } from 'market-data';
import { getLivescoreMetrics } from '../../services/sports/livescore';

// Per Phase 1 #9: a job that has never run is not unhealthy — it's pending.
// Returning a tri-state lets the UI exclude pending from the "failing jobs"
// alert so cold-start doesn't fire a spurious warning banner.
type JobStatus = 'ok' | 'error' | 'pending';
function deriveJobStatus(lastRunAt: Date | null | undefined, lastErrorAt: Date | null | undefined): JobStatus {
  if (lastRunAt == null) return 'pending';
  if (lastErrorAt != null && lastErrorAt >= lastRunAt) return 'error';
  return 'ok';
}

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
      // Authority SOL balance. The previous implementation had a dead
      // fallback ternary (`getStatus().authority` is always set, so the
      // System Program path was unreachable), called getStatus() a second
      // time, and lazy-imported @solana/web3.js twice on the hot path.
      // See PLAN-ADMIN-REFACTOR.md Phase 1 #8.
      (async () => {
        try {
          const balance = await connection.getBalance(new PublicKey(status.authority));
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

    // Per-job health. `status` is the new tri-state ('ok' | 'error' |
    // 'pending'); `healthy` is kept for backward compat with the UI's
    // current `allJobsHealthy` check but will be retired in Phase 3 once
    // the SystemHealth refactor migrates the UI to read `status` directly.
    const jobHealth = scheduler.getJobHealth().map(j => {
      const jobStatus = deriveJobStatus(j.lastRunAt, j.lastErrorAt);
      return {
        name: j.name,
        schedule: j.schedule,
        lastRunAt: j.lastRunAt?.toISOString() ?? null,
        lastErrorAt: j.lastErrorAt?.toISOString() ?? null,
        lastError: j.lastError,
        runCount: j.runCount,
        errorCount: j.errorCount,
        status: jobStatus,
        // Compat field — true only when the job has actually run and didn't
        // error since. Pending jobs (cold start) are NOT marked healthy
        // here, but the UI excludes them from `failingJobs` via the new
        // `status === 'error'` filter once Phase 3 lands.
        healthy: jobStatus === 'ok',
      };
    });

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
        // PR 18 / Phase 5 — `rpcEndpoints` was never read by the SystemHealth
        // UI. Drop it from the response; bring it back with a real renderer
        // when the multi-RPC fallback ships (see MEMORY.md TODO).
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
