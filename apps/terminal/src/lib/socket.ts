'use client';

import { io, type Socket } from 'socket.io-client';

// Connects to the UpDown API socket (same server as the web app) so the terminal
// receives live reward events (user:reward) without polling. One shared socket.
const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      transports: ['websocket'],
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}
