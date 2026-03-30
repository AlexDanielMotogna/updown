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
  const wsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];
  io = new Server(httpServer, {
    cors: {
      origin: wsOrigin,
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
        // Skip sports assets (league codes contain ':')
        if (asset.includes(':')) continue;

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

    // Handle squad subscriptions
    socket.on('subscribe:squad', (data: { squadId: string }) => {
      if (!data?.squadId) return;
      socket.join(`squad:${data.squadId}`);
      console.log(`[WS] ${socket.id} subscribed to squad:${data.squadId}`);
    });

    socket.on('unsubscribe:squad', (data: { squadId: string }) => {
      if (!data?.squadId) return;
      socket.leave(`squad:${data.squadId}`);
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
 * Price streaming via Pacifica WebSocket — 0 REST requests.
 * Pacifica pushes price updates through wss://ws.pacifica.fi/ws.
 */
const activeAssets = new Set<string>();

function startPriceStream(asset: string): void {
  if (asset.includes(':')) return; // skip sports league codes
  if (activeAssets.has(asset)) return;
  activeAssets.add(asset);

  if (!priceProvider) return;

  console.log(`[WS] Subscribing to ${asset} via Pacifica WebSocket`);

  priceProvider.subscribe(asset, (tick) => {
    const priceStr = (Number(tick.price) / 1_000_000).toFixed(2);

    priceCache.set(asset, {
      price: priceStr,
      timestamp: tick.timestamp.getTime(),
    });

    if (io) {
      io.to(`prices:${asset}`).emit('price:tick', {
        asset,
        price: priceStr,
        timestamp: tick.timestamp.getTime(),
      });
    }
  });
}

function stopPriceStream(asset: string): void {
  activeAssets.delete(asset);
  if (priceProvider) {
    priceProvider.unsubscribe(asset);
  }
  console.log(`[WS] Unsubscribed from ${asset}`);
}

/**
 * Emit a pool update to subscribers
 */
export function emitPoolUpdate(poolId: string, data: {
  id: string;
  totalUp: string;
  totalDown: string;
  totalDraw?: string;
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
    // Broadcast globally  the frontend filters by poolId where needed.
    // Using a single emit avoids duplicate delivery to clients in the pool room.
    io.emit('pool:status', data);
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
 * Emit a refund notification to a specific wallet address
 */
export function emitRefund(walletAddress: string, data: {
  poolId: string;
  amount: string;
  txSignature: string;
}): void {
  if (io) {
    io.emit('wallet:refund', { walletAddress, ...data });
  }
}

/**
 * Emit a user reward event (XP / coins / level-up).
 * Broadcasts globally  the frontend filters by wallet address.
 */
export function emitUserReward(walletAddress: string, data: {
  xp: number;
  coins: number;
  level: number;
  levelUp: boolean;
  totalXp: number;
  xpToNextLevel: number;
  streak?: number;
  reason?: string;
}): void {
  if (io) {
    io.emit('user:reward', { walletAddress, ...data });
  }
}

/**
 * Emit tournament match result (broadcast globally, frontend filters by wallet)
 */
export function emitTournamentMatchResult(data: {
  tournamentId: string;
  tournamentName: string;
  matchId: string;
  round: number;
  winnerWallet: string;
  loserWallet: string | null;
  asset: string;
  completed?: boolean;
  prizePool?: string;
}): void {
  if (io) {
    io.emit('tournament:match:result', data);
  }
}

/**
 * Emit a squad chat message to squad room
 */
export function emitSquadMessage(squadId: string, message: {
  id: string;
  walletAddress: string;
  content: string;
  createdAt: string;
}): void {
  if (io) {
    io.to(`squad:${squadId}`).emit('squad:message', { squadId, message });
  }
}

/**
 * Emit a new squad pool to squad room
 */
export function emitSquadPoolNew(squadId: string, pool: object): void {
  if (io) {
    io.to(`squad:${squadId}`).emit('squad:pool:new', { squadId, pool });
  }
}

/**
 * Emit a member joined event to squad room
 */
export function emitSquadMemberJoined(squadId: string, member: {
  walletAddress: string;
  role: string;
  joinedAt: string;
}): void {
  if (io) {
    io.to(`squad:${squadId}`).emit('squad:member:joined', { squadId, member });
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
  activeAssets.clear();

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
