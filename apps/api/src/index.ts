import express, { type Express } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { poolsRouter } from './routes/pools';
import { betsRouter } from './routes/bets';
import { healthRouter, startUptimeCron } from './routes/health';
import { transactionsRouter } from './routes/transactions';
import { usersRouter } from './routes/users';
import { adminRouter } from './routes/admin';
import { referralsRouter } from './routes/referrals';
import { squadsRouter } from './routes/squads';
import { tournamentRouter } from './routes/tournaments';
import { configRouter } from './routes/config';
import { notificationsRouter } from './routes/notifications';
import { milestonesRouter } from './routes/milestones';
import { getScheduler } from './scheduler';
import { startTournamentScheduler } from './scheduler/tournament-scheduler';
import { startSportsScheduler } from './scheduler/sports-scheduler';
import { startFixtureSyncScheduler } from './scheduler/fixture-sync';
import { startPolymarketSyncScheduler } from './scheduler/polymarket-sync';
import { seedCategoriesIfEmpty } from './services/category-config';
import { startLiveScorePolling } from './services/sports/livescore';
import { initWebSocket, shutdownWebSocket, ensurePriceStreams } from './websocket';
import { prisma } from './db';
import { initPriceHistoryPersistence, hydratePriceHistory } from './services/price-history';

dotenv.config();

const app: Express = express();
// Behind Railway's proxy — trust X-Forwarded-For so req.ip is the real client
// IP (needed for referral anti-cheat / activity signals), not the LB address.
app.set('trust proxy', true);
const httpServer = createServer(app);
const PORT = process.env.PORT || 3002;

// Middleware
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : 'http://localhost:3000';
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/health', healthRouter);
app.use('/api/pools', poolsRouter);
app.use('/api/bets', betsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/referrals', referralsRouter);
app.use('/api/squads', squadsRouter);
app.use('/api/tournaments', tournamentRouter);
app.use('/api/config', configRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/milestones', milestonesRouter);

// Scheduler status endpoint
app.get('/api/scheduler/status', (req, res) => {
  const scheduler = getScheduler();
  res.json({
    success: true,
    data: scheduler.getStatus(),
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
});

// Initialize WebSocket
initWebSocket(httpServer);

// Wire the price-history buffer to persist into Postgres so a restart
// doesn't leave the next 8 minutes of crypto pool resolutions falling
// back to the "current" spot price. See services/price-history.ts.
initPriceHistoryPersistence(prisma);

// Start server and scheduler
httpServer.listen(PORT, async () => {
  console.log(`API server running on port ${PORT}`);

  // Cold-start: hydrate the price-history ring buffer with the last
  // hour of ticks BEFORE the scheduler comes up. Without this, any
  // crypto pool whose endTime falls inside the post-restart 8-minute
  // window resolves with the "spot now" fallback — exactly the bug
  // class this whole branch fixes.
  try {
    const { assets, ticks } = await hydratePriceHistory(prisma);
    if (ticks > 0) {
      console.log(`[PriceHistory] Hydrated ${ticks} tick(s) across ${assets} asset(s) from price_ticks.`);
    }
  } catch (err) {
    console.warn('[PriceHistory] Hydration failed (resolver will fall back to spot price):', err instanceof Error ? err.message : err);
  }

  // Server-initiated Pacifica WS subscriptions for every asset we have
  // an open crypto pool on. Without this the buffer only fills when a
  // client lands on /pool/[id] — so a pool whose endTime falls in a
  // "no client connected" gap resolves with the spot-fallback (which
  // is the exact "current price, not at endTime" bug we fixed in this
  // branch). startPriceStream is ref-counted via activeAssets so the
  // client-initiated path still works on top.
  try {
    const openCryptoPools = await prisma.pool.findMany({
      where: {
        poolType: 'CRYPTO',
        status: { in: ['UPCOMING', 'JOINING', 'ACTIVE'] },
      },
      select: { asset: true },
      distinct: ['asset'],
    });
    const assets = openCryptoPools.map(p => p.asset);
    if (assets.length > 0) {
      ensurePriceStreams(assets);
      console.log(`[PriceHistory] Auto-subscribed to Pacifica price stream for ${assets.length} asset(s): ${assets.join(', ')}`);
    }
  } catch (err) {
    console.warn('[PriceHistory] Auto-subscribe failed (buffer will only fill when clients subscribe):', err instanceof Error ? err.message : err);
  }

  // Auto-seed category config if the table is empty (must run before schedulers,
  // which read category config). Makes a fresh DB admin-driven from the start.
  await seedCategoriesIfEmpty();

  // Start the pool scheduler
  try {
    const scheduler = getScheduler();
    await scheduler.start();
  } catch (error) {
    console.error('Failed to start scheduler:', error);
  }

  // Start uptime monitoring cron
  try {
    await startUptimeCron();
  } catch (error) {
    console.error('Failed to start uptime cron:', error);
  }

  // Start tournament scheduler
  try {
    startTournamentScheduler();
  } catch (error) {
    console.error('Failed to start tournament scheduler:', error);
  }

  try {
    startFixtureSyncScheduler();
  } catch (error) {
    console.error('Failed to start fixture sync scheduler:', error);
  }

  try {
    startPolymarketSyncScheduler();
  } catch (error) {
    console.error('Failed to start Polymarket sync scheduler:', error);
  }

  try {
    startSportsScheduler();
  } catch (error) {
    console.error('Failed to start sports scheduler:', error);
  }

  try {
    startLiveScorePolling();
  } catch (error) {
    console.error('Failed to start livescore polling:', error);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  const scheduler = getScheduler();
  scheduler.stop();
  shutdownWebSocket();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  const scheduler = getScheduler();
  scheduler.stop();
  shutdownWebSocket();
  process.exit(0);
});

export default app;
