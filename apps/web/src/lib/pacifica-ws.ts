/**
 * Shared native WebSocket connection to Pacifica's streaming API.
 *
 * Pacifica uses raw WebSocket (not socket.io).
 * URL: wss://ws.pacifica.fi/ws
 *
 * Subscribe:  { "method": "subscribe", "params": { "source": "mark_price_candle", "symbol": "BTC", "interval": "1m" } }
 * Unsubscribe: { "method": "unsubscribe", "params": { "source": "mark_price_candle", "symbol": "BTC", "interval": "1m" } }
 * Messages arrive as: { "channel": "mark_price_candle", "data": { ... } }
 */

import { PACIFICA_WS_URL } from '@/lib/constants';

const WS_URL = PACIFICA_WS_URL;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

type MessageHandler = (channel: string, data: unknown) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let intentionalClose = false;

const listeners = new Set<MessageHandler>();
const activeSubscriptions = new Map<string, object>(); // key -> params

function subsKey(params: Record<string, string>): string {
  return `${params.source}:${params.symbol ?? ''}:${params.interval ?? ''}`;
}

function sendJSON(msg: object) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function resubscribeAll() {
  for (const params of activeSubscriptions.values()) {
    sendJSON({ method: 'subscribe', params });
  }
}

function scheduleReconnect() {
  if (intentionalClose) return;
  if (reconnectTimer) return;

  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
  reconnectAttempt++;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  if (typeof window === 'undefined') return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  intentionalClose = false;

  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectAttempt = 0;
    resubscribeAll();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      if (msg.channel && msg.data) {
        for (const handler of listeners) {
          handler(msg.channel, msg.data);
        }
      }
    } catch {
      // ignore parse errors
    }
  };

  ws.onclose = () => {
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose will fire after onerror
  };
}

/**
 * Ensure the Pacifica WebSocket is connected.
 */
export function ensureConnected(): void {
  if (typeof window === 'undefined') return;
  connect();
}

/**
 * Subscribe to a Pacifica WS channel.
 * Returns an unsubscribe function.
 */
export function subscribe(params: Record<string, string>): () => void {
  const key = subsKey(params);
  activeSubscriptions.set(key, params);
  ensureConnected();
  sendJSON({ method: 'subscribe', params });

  return () => {
    activeSubscriptions.delete(key);
    sendJSON({ method: 'unsubscribe', params });

    // If no more subscriptions, close after a short delay
    if (activeSubscriptions.size === 0) {
      setTimeout(() => {
        if (activeSubscriptions.size === 0 && ws) {
          intentionalClose = true;
          ws.close();
          ws = null;
        }
      }, 5000);
    }
  };
}

/**
 * Add a global message listener. Returns a removal function.
 */
export function addListener(handler: MessageHandler): () => void {
  listeners.add(handler);
  return () => { listeners.delete(handler); };
}
