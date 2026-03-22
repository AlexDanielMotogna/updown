import { Router, type Router as RouterType } from 'express';
import { prisma } from '../db';
import { getConnection, getRpcStats } from '../utils/solana';
import { getScheduler } from '../scheduler';

export const healthRouter: RouterType = Router();

// Basic health check
healthRouter.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
  });
});

// Detailed status for the status page
healthRouter.get('/status', async (req, res) => {
  const start = Date.now();
  const services: Array<{
    name: string;
    status: 'operational' | 'degraded' | 'down';
    latency?: number;
    details?: string;
  }> = [];

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

  // Overall status
  const allOperational = services.every(s => s.status === 'operational');
  const anyDown = services.some(s => s.status === 'down');

  res.json({
    success: true,
    data: {
      overall: anyDown ? 'partial_outage' : allOperational ? 'operational' : 'degraded',
      services,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - start,
    },
  });
});
