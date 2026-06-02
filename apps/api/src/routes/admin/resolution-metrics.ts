import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db';

/**
 * Operator-facing resolution metrics. Snapshot of how quickly + reliably
 * the resolver pipeline is closing pools out, plus a recent-history list
 * so the operator can spot regressions visually.
 *
 * Metric definitions
 *   - resolvedAt:    Pool.updatedAt when status flipped to CLAIMABLE /
 *                    RESOLVED / CANCELLED. We use updatedAt directly
 *                    instead of joining EventLog — it's good enough for
 *                    p50/p90/p99 and avoids a join over thousands of rows.
 *   - latencyMs:     resolvedAt − endTime. Negative values (we
 *                    resolved BEFORE endTime, rare edge case) clamp to 0.
 *   - 'resolved':    status ∈ {RESOLVED, CLAIMABLE} — the success path.
 *   - 'cancelled':   status === CANCELLED — usually delisted PM markets
 *                    or sweep-cancelled stale rows.
 *   - 'stuck':       status ∈ {JOINING, ACTIVE} AND endTime < now. Pool
 *                    overdue but pipeline hasn't acted yet.
 *
 * Window: filters by createdAt so a pool that was created weeks ago but
 * just resolved doesn't leak into the '24h' view. Default 7d.
 */
export const adminResolutionMetricsRouter: RouterType = Router();

type Window = '24h' | '7d' | '30d' | 'all';
const WINDOW_MS: Record<Window, number | null> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  'all': null,
};

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base];
}

adminResolutionMetricsRouter.get('/', async (req, res) => {
  try {
    const rawWindow = String(req.query.window ?? '7d');
    const window: Window = ['24h', '7d', '30d', 'all'].includes(rawWindow) ? rawWindow as Window : '7d';
    const windowMs = WINDOW_MS[window];
    const now = new Date();
    const cutoff = windowMs ? new Date(now.getTime() - windowMs) : null;

    // Pull everything in window in one query. createdAt filter applies
    // even on 'all' so we don't drag the entire pool history.
    const where: { createdAt?: { gte: Date } } = {};
    if (cutoff) where.createdAt = { gte: cutoff };

    const pools = await prisma.pool.findMany({
      where,
      select: {
        id: true,
        league: true,
        poolType: true,
        status: true,
        winner: true,
        homeTeam: true,
        awayTeam: true,
        createdAt: true,
        startTime: true,
        endTime: true,
        updatedAt: true,
        matchId: true,
        _count: { select: { bets: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Pre-classify each pool + compute latency once.
    type Bucket = 'resolved' | 'cancelled' | 'stuck' | 'pending';
    function classify(p: typeof pools[number]): Bucket {
      if (p.status === 'CLAIMABLE' || p.status === 'RESOLVED') return 'resolved';
      if (p.status === 'CANCELLED') return 'cancelled';
      if ((p.status === 'JOINING' || p.status === 'ACTIVE') && p.endTime < now) return 'stuck';
      return 'pending';
    }
    function latencyMs(p: typeof pools[number]): number | null {
      if (p.status === 'CLAIMABLE' || p.status === 'RESOLVED' || p.status === 'CANCELLED') {
        return Math.max(0, p.updatedAt.getTime() - p.endTime.getTime());
      }
      return null;
    }

    const enriched = pools.map(p => ({
      pool: p,
      bucket: classify(p),
      latencyMs: latencyMs(p),
    }));

    // Overall aggregates.
    const overall = {
      window,
      totalPools: enriched.length,
      resolved: enriched.filter(e => e.bucket === 'resolved').length,
      cancelled: enriched.filter(e => e.bucket === 'cancelled').length,
      stuck: enriched.filter(e => e.bucket === 'stuck').length,
      pending: enriched.filter(e => e.bucket === 'pending').length,
      // Latency stats over the resolved bucket only — cancelled often
      // sat past the grace, so including them skews the p90.
      p50LatencyMs: null as number | null,
      p90LatencyMs: null as number | null,
      p99LatencyMs: null as number | null,
      avgLatencyMs: null as number | null,
    };
    const resolvedLatencies = enriched
      .filter(e => e.bucket === 'resolved' && e.latencyMs !== null)
      .map(e => e.latencyMs!)
      .sort((a, b) => a - b);
    if (resolvedLatencies.length > 0) {
      overall.p50LatencyMs = quantile(resolvedLatencies, 0.5);
      overall.p90LatencyMs = quantile(resolvedLatencies, 0.9);
      overall.p99LatencyMs = quantile(resolvedLatencies, 0.99);
      overall.avgLatencyMs = Math.round(resolvedLatencies.reduce((s, n) => s + n, 0) / resolvedLatencies.length);
    }

    // Per-category breakdown. Code 'CRYPTO' for poolType=CRYPTO; 'NULL' for
    // pools whose league field is null (shouldn't happen post-migration).
    const byCode = new Map<string, typeof enriched>();
    for (const e of enriched) {
      const code = e.pool.poolType === 'CRYPTO' ? 'CRYPTO' : (e.pool.league ?? 'NULL');
      const arr = byCode.get(code) ?? [];
      arr.push(e);
      byCode.set(code, arr);
    }
    const perCategory = Array.from(byCode.entries()).map(([code, group]) => {
      const total = group.length;
      const resolved = group.filter(e => e.bucket === 'resolved').length;
      const cancelled = group.filter(e => e.bucket === 'cancelled').length;
      const stuck = group.filter(e => e.bucket === 'stuck').length;
      const pending = group.filter(e => e.bucket === 'pending').length;
      const latencies = group
        .filter(e => e.bucket === 'resolved' && e.latencyMs !== null)
        .map(e => e.latencyMs!)
        .sort((a, b) => a - b);
      return {
        code,
        total,
        resolved,
        cancelled,
        stuck,
        pending,
        p50LatencyMs: quantile(latencies, 0.5),
        p90LatencyMs: quantile(latencies, 0.9),
        avgLatencyMs: latencies.length > 0
          ? Math.round(latencies.reduce((s, n) => s + n, 0) / latencies.length)
          : null,
      };
    }).sort((a, b) => b.total - a.total);

    // Recent resolutions (resolved or cancelled only) — last 50, sorted
    // by resolvedAt desc. Useful for spotting "every recent PM is taking
    // 30h+" patterns at a glance.
    const recent = enriched
      .filter(e => e.bucket === 'resolved' || e.bucket === 'cancelled')
      .sort((a, b) => b.pool.updatedAt.getTime() - a.pool.updatedAt.getTime())
      .slice(0, 50)
      .map(e => ({
        poolId: e.pool.id,
        code: e.pool.poolType === 'CRYPTO' ? 'CRYPTO' : e.pool.league,
        poolType: e.pool.poolType,
        homeTeam: e.pool.homeTeam,
        awayTeam: e.pool.awayTeam,
        bucket: e.bucket,
        status: e.pool.status,
        winner: e.pool.winner,
        betCount: e.pool._count.bets,
        startTime: e.pool.startTime?.toISOString() ?? null,
        endTime: e.pool.endTime.toISOString(),
        resolvedAt: e.pool.updatedAt.toISOString(),
        latencyMs: e.latencyMs,
      }));

    res.json({ success: true, data: { overall, perCategory, recent } });
  } catch (error) {
    console.error('[AdminResolutionMetrics] error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'unknown' } });
  }
});
