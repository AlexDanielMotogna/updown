import express, { type Express } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { poolsRouter } from './routes/pools';
import { betsRouter } from './routes/bets';
import { healthRouter } from './routes/health';
import { transactionsRouter } from './routes/transactions';
import { getScheduler } from './scheduler';
import { initWebSocket, shutdownWebSocket } from './websocket';

dotenv.config();

const app: Express = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/health', healthRouter);
app.use('/api/pools', poolsRouter);
app.use('/api/bets', betsRouter);
app.use('/api/transactions', transactionsRouter);

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
