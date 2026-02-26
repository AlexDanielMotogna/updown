import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

let socket: Socket | null = null;

/**
 * Check if running in browser
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Get or create socket connection
 */
export function getSocket(): Socket {
  if (!isBrowser()) {
    // Return a dummy socket for SSR that does nothing
    return {
      on: () => {},
      off: () => {},
      emit: () => {},
      connect: () => {},
      disconnect: () => {},
      connected: false,
    } as unknown as Socket;
  }

  if (!socket) {
    console.log('[Socket] Creating socket connection to:', SOCKET_URL);
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Debug listeners
    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });
  }
  return socket;
}

/**
 * Connect to socket server
 */
export function connectSocket(): void {
  if (!isBrowser()) return;

  const sock = getSocket();
  if (!sock.connected) {
    sock.connect();
  }
}

/**
 * Disconnect from socket server
 */
export function disconnectSocket(): void {
  if (!isBrowser()) return;

  if (socket?.connected) {
    socket.disconnect();
  }
}

/**
 * Subscribe to price updates for assets
 */
export function subscribePrices(assets: string[]): void {
  if (!isBrowser()) return;

  const sock = getSocket();
  sock.emit('subscribe:prices', { assets });
}

/**
 * Unsubscribe from price updates
 */
export function unsubscribePrices(assets: string[]): void {
  if (!isBrowser()) return;

  const sock = getSocket();
  sock.emit('unsubscribe:prices', { assets });
}

/**
 * Subscribe to pool updates
 */
export function subscribePool(poolId: string): void {
  if (!isBrowser()) return;

  const sock = getSocket();
  sock.emit('subscribe:pool', { poolId });
}

/**
 * Unsubscribe from pool updates
 */
export function unsubscribePool(poolId: string): void {
  if (!isBrowser()) return;

  const sock = getSocket();
  sock.emit('unsubscribe:pool', { poolId });
}

export type { Socket };
