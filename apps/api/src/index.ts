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
import { getScheduler } from './scheduler';
import { startTournamentScheduler } from './scheduler/tournament-scheduler';
import { startSportsScheduler } from './scheduler/sports-scheduler';
import { startFixtureSyncScheduler } from './scheduler/fixture-sync';
import { startPolymarketSyncScheduler } from './scheduler/polymarket-sync';
import { startLiveScorePolling } from './services/sports/livescore';
import { initWebSocket, shutdownWebSocket } from './websocket';

dotenv.config();

const app: Express = express();
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

// Start server and scheduler
httpServer.listen(PORT, async () => {
  console.log(`API server running on port ${PORT}`);

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
