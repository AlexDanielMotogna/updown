import { Router, type Router as RouterType } from 'express';
import { prisma } from '../db';
import { getConnection } from '../utils/solana';
import { getScheduler } from '../scheduler';

export const healthRouter: RouterType = Router();

// ─── Shared check logic ──────────────────────────────────────────────────────

interface ServiceCheck {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency?: number;
  details?: string;
}

async function runServiceChecks(): Promise<{
  overall: 'operational' | 'degraded' | 'partial_outage';
  services: ServiceCheck[];
}> {
  const services: ServiceCheck[] = [];

  // 1. API
  services.push({
    name: 'API Server',
    status: 'operational',
    latency: 0,
    details: 'Responding to requests',
  });

  // 2. Database
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    services.push({
      name: 'Database',
      status: 'operational',
      latency: Date.now() - dbStart,
    });
  } catch {
    services.push({ name: 'Database', status: 'down', details: 'Connection failed' });
  }

  // 3. Solana RPC
  try {
    const rpcStart = Date.now();
    const slot = await getConnection().getSlot();
    services.push({
      name: 'Solana RPC',
      status: 'operational',
      latency: Date.now() - rpcStart,
      details: `Slot ${slot.toLocaleString()}`,
    });
  } catch {
    services.push({ name: 'Solana RPC', status: 'degraded', details: 'RPC unreachable' });
  }

  // 4. Scheduler
  try {
    const scheduler = getScheduler();
    const status = scheduler.getStatus();
    services.push({
      name: 'Pool Scheduler',
      status: status.isRunning ? 'operational' : 'down',
      details: status.isRunning ? `${status.jobCount} jobs active` : 'Not running',
    });
  } catch {
    services.push({ name: 'Pool Scheduler', status: 'down', details: 'Not initialized' });
  }

  // 5. WebSocket
  try {
    const { getIO } = require('../websocket');
    const io = getIO();
    if (io) {
      const sockets = await io.fetchSockets();
      services.push({
        name: 'WebSocket',
        status: 'operational',
        details: `${sockets.length} connected`,
      });
    } else {
      services.push({ name: 'WebSocket', status: 'down', details: 'Not initialized' });
    }
  } catch {
    services.push({ name: 'WebSocket', status: 'degraded', details: 'Check failed' });
  }

  const allOperational = services.every(s => s.status === 'operational');
  const anyDown = services.some(s => s.status === 'down');
  const overall = anyDown ? 'partial_outage' as const : allOperational ? 'operational' as const : 'degraded' as const;

  return { overall, services };
}

// ─── Basic health check ──────────────────────────────────────────────────────

healthRouter.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── Detailed status (live) ──────────────────────────────────────────────────

healthRouter.get('/status', async (req, res) => {
  const start = Date.now();
  const { overall, services } = await runServiceChecks();

  res.json({
    success: true,
    data: {
      overall,
      services,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - start,
    },
  });
});

// ─── 90-day history (aggregated per day per service) ─────────────────────────

healthRouter.get('/history', async (req, res) => {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    ninetyDaysAgo.setHours(0, 0, 0, 0);

    const checks = await prisma.uptimeCheck.findMany({
      where: { createdAt: { gte: ninetyDaysAgo } },
      orderBy: { createdAt: 'asc' },
      select: { status: true, services: true, createdAt: true },
    });

    // Build per-day, per-service aggregation
    // Map<"YYYY-MM-DD", Map<serviceName, { total, operational, degraded, down }>>
    const dayMap = new Map<string, Map<string, { total: number; operational: number; degraded: number; down: number }>>();

    for (const check of checks) {
      const dayKey = check.createdAt.toISOString().slice(0, 10);
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, new Map());
      const serviceMap = dayMap.get(dayKey)!;

      const services = check.services as unknown as ServiceCheck[];
      for (const svc of services) {
        if (!serviceMap.has(svc.name)) {
          serviceMap.set(svc.name, { total: 0, operational: 0, degraded: 0, down: 0 });
        }
        const counts = serviceMap.get(svc.name)!;
        counts.total++;
        if (svc.status === 'operational') counts.operational++;
        else if (svc.status === 'degraded') counts.degraded++;
        else counts.down++;
      }
    }

    // Build 90-day array for each service
    const serviceNames = ['API Server', 'Database', 'Solana RPC', 'Pool Scheduler', 'WebSocket'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const history = serviceNames.map(name => {
      const days: Array<{
        date: string;
        status: 'operational' | 'degraded' | 'down' | 'no_data';
        uptime: number; // 0-100
      }> = [];

      let totalChecks = 0;
      let operationalChecks = 0;

      for (let i = 89; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const counts = dayMap.get(key)?.get(name);

        if (!counts || counts.total === 0) {
          days.push({ date: key, status: 'no_data', uptime: 100 });
        } else {
          totalChecks += counts.total;
          operationalChecks += counts.operational;

          let status: 'operational' | 'degraded' | 'down';
          if (counts.down > 0) status = 'down';
          else if (counts.degraded > 0) status = 'degraded';
          else status = 'operational';

          const dayUptime = ((counts.operational + counts.degraded) / counts.total) * 100;
          days.push({ date: key, status, uptime: Math.round(dayUptime * 1000) / 1000 });
        }
      }

      const uptimePercent = totalChecks > 0
        ? Math.round((operationalChecks / totalChecks) * 100_000) / 1000
        : 100;

      return { name, days, uptimePercent };
    });

    res.json({ success: true, data: { history } });
  } catch (error) {
    console.error('[Health] History error:', error);
    res.status(500).json({ success: false, error: { code: 'HISTORY_ERROR', message: 'Failed to load history' } });
  }
});

// ─── Uptime cron (every 5 min) ───────────────────────────────────────────────

let uptimeCronStarted = false;

export async function startUptimeCron(): Promise<void> {
  if (uptimeCronStarted) return;
  uptimeCronStarted = true;

  const cron = await import('node-cron');

  // Run immediately on boot
  recordUptimeCheck();

  // Then every 5 minutes
  cron.default.schedule('*/5 * * * *', () => {
    recordUptimeCheck();
  });

  console.log('[Uptime] Cron started — recording every 5 minutes');
}

async function recordUptimeCheck(): Promise<void> {
  try {
    const { overall, services } = await runServiceChecks();
    await prisma.uptimeCheck.create({
      data: {
        status: overall,
        services: services as any,
      },
    });
  } catch (error) {
    console.error('[Uptime] Failed to record check:', error);
  }
}
