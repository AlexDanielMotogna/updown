import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { PacificaProvider } from 'market-data';

let io: Server | null = null;
let priceProvider: PacificaProvider | null = null;

// Track active subscriptions per room
const roomSubscriptions = new Map<string, number>();

// Price cache for immediate delivery to new subscribers
const priceCache = new Map<string, { price: string; timestamp: number }>();

/**
 * Initialize Socket.io server
 */
export function initWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://127.0.0.1:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    allowEIO3: true,
  });

  console.log('[WS] WebSocket server configured with CORS:', process.env.CORS_ORIGIN || 'localhost:3000');

  // Initialize Pacifica provider for price streaming
  priceProvider = new PacificaProvider();

  io.on('connection', (socket: Socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // Handle price subscriptions
    socket.on('subscribe:prices', async (data: { assets: string[] }) => {
      if (!Array.isArray(data?.assets)) return;

      for (const asset of data.assets) {
        const room = `prices:${asset}`;
        socket.join(room);

        // Track subscription count
        const count = (roomSubscriptions.get(room) || 0) + 1;
        roomSubscriptions.set(room, count);

        // If first subscriber, start price stream
        if (count === 1) {
          startPriceStream(asset);
        }

        // Send cached price immediately if available
        const cached = priceCache.get(asset);
        if (cached) {
          socket.emit('price:tick', {
            asset,
            price: cached.price,
            timestamp: cached.timestamp,
          });
        }
      }

      console.log(`[WS] ${socket.id} subscribed to prices:`, data.assets);
    });

    socket.on('unsubscribe:prices', (data: { assets: string[] }) => {
      if (!Array.isArray(data?.assets)) return;

      for (const asset of data.assets) {
        const room = `prices:${asset}`;
        socket.leave(room);

        // Track subscription count
        const count = Math.max(0, (roomSubscriptions.get(room) || 0) - 1);
        roomSubscriptions.set(room, count);

        // If no more subscribers, stop price stream
        if (count === 0) {
          stopPriceStream(asset);
        }
      }
    });

    // Handle pool subscriptions
    socket.on('subscribe:pool', (data: { poolId: string }) => {
      if (!data?.poolId) return;
      socket.join(`pool:${data.poolId}`);
      console.log(`[WS] ${socket.id} subscribed to pool:${data.poolId}`);
    });

    socket.on('unsubscribe:pool', (data: { poolId: string }) => {
      if (!data?.poolId) return;
      socket.leave(`pool:${data.poolId}`);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[WS] WebSocket server initialized');
  return io;
}

/**
 * Start price streaming for an asset
 */
const priceIntervals = new Map<string, NodeJS.Timeout>();

async function startPriceStream(asset: string): Promise<void> {
  if (priceIntervals.has(asset)) return;

  console.log(`[WS] Starting price stream for ${asset}`);

  // Fetch price every second and broadcast
  const interval = setInterval(async () => {
    try {
      if (!priceProvider) return;

      const tick = await priceProvider.getSpotPrice(asset);
      // tick.price is in 6 decimal format (e.g., 103500000000 for $103,500.00)
      const priceStr = (Number(tick.price) / 1_000_000).toFixed(2);

      // Cache the price
      priceCache.set(asset, {
        price: priceStr,
        timestamp: tick.timestamp.getTime(),
      });

      // Broadcast to room
      if (io) {
        io.to(`prices:${asset}`).emit('price:tick', {
          asset,
          price: priceStr,
          timestamp: tick.timestamp.getTime(),
        });
      }
    } catch (error) {
      console.error(`[WS] Failed to fetch price for ${asset}:`, error);
    }
  }, 1000);

  priceIntervals.set(asset, interval);
}

function stopPriceStream(asset: string): void {
  const interval = priceIntervals.get(asset);
  if (interval) {
    clearInterval(interval);
    priceIntervals.delete(asset);
    console.log(`[WS] Stopped price stream for ${asset}`);
  }
}

/**
 * Emit a pool update to subscribers
 */
export function emitPoolUpdate(poolId: string, data: {
  id: string;
  totalUp: string;
  totalDown: string;
}): void {
  if (io) {
    io.to(`pool:${poolId}`).emit('pool:updated', data);
  }
}

/**
 * Emit a pool status change to subscribers
 */
export function emitPoolStatus(poolId: string, data: {
  id: string;
  status: string;
  strikePrice?: string;
  finalPrice?: string;
  winner?: string;
}): void {
  if (io) {
    io.to(`pool:${poolId}`).emit('pool:status', data);
  }
}

/**
 * Emit new pool creation to all clients
 */
export function emitNewPool(pool: object): void {
  if (io) {
    io.emit('pools:new', { pool });
  }
}

/**
 * Get Socket.io server instance
 */
export function getIO(): Server | null {
  return io;
}

/**
 * Cleanup on shutdown
 */
export function shutdownWebSocket(): void {
  // Stop all price streams
  for (const [asset] of priceIntervals) {
    stopPriceStream(asset);
  }

  // Disconnect provider
  if (priceProvider) {
    priceProvider.disconnect();
  }

  // Close socket server
  if (io) {
    io.close();
    io = null;
  }
}
