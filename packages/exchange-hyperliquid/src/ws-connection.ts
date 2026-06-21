/**
 * HyperliquidWsConnection — one WebSocket, many subscriptions.
 *
 * Handles: connect, auto-reconnect with capped backoff, re-subscribing on
 * reconnect, ref-counted subscriptions (one server sub per unique feed, fanned
 * out to N local handlers), and routing incoming messages to the right handler.
 *
 * The WebSocket impl is injectable (browser `WebSocket` by default) so this runs
 * in the terminal and is testable in Node without a real socket.
 */

/** Minimal browser-WebSocket-shaped interface (works for `ws` in Node too). */
export interface WsLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev?: unknown) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type WsFactory = (url: string) => WsLike;

/** A HyperLiquid subscription object, e.g. { type:'l2Book', coin:'BTC' }. */
export type Subscription = Record<string, unknown> & { type: string };

type Handler = (data: unknown) => void;

interface Entry {
  subscription: Subscription;
  handlers: Set<Handler>;
  /** Last payload seen on this feed, replayed to handlers that subscribe late. */
  last?: unknown;
}

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15_000;

function defaultWsFactory(url: string): WsLike {
  const Ctor = (globalThis as { WebSocket?: new (url: string) => WsLike }).WebSocket;
  if (!Ctor) {
    throw new Error(
      'No global WebSocket. Pass a WsFactory (e.g. backed by the "ws" package) in Node.'
    );
  }
  return new Ctor(url);
}

/** Routing key for a subscription/message: `type:coin`, `type:user`, or `type`. */
export function routingKey(o: { type?: string; channel?: string; coin?: unknown; user?: unknown }): string {
  const channel = o.type ?? o.channel ?? '';
  if (typeof o.coin === 'string') return `${channel}:${o.coin}`;
  if (typeof o.user === 'string') return `${channel}:${o.user.toLowerCase()}`;
  return channel;
}

export class HyperliquidWsConnection {
  private ws: WsLike | null = null;
  private opened = false;
  private closedByUser = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly url: string,
    private readonly wsFactory: WsFactory = defaultWsFactory
  ) {}

  /** Subscribe a handler to a feed. Returns an unsubscribe function. */
  subscribe(subscription: Subscription, handler: Handler): () => void {
    const key = routingKey(subscription);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { subscription, handlers: new Set() };
      this.entries.set(key, entry);
      this.ensureConnected();
      this.sendSub('subscribe', subscription);
    }
    entry.handlers.add(handler);
    // Replay the latest snapshot so a late subscriber to a shared feed doesn't
    // wait for the next push (e.g. openOrders only pushes on change).
    if (entry.last !== undefined) {
      const last = entry.last;
      queueMicrotask(() => { if (this.entries.get(key)?.handlers.has(handler)) handler(last); });
    }

    return () => {
      const e = this.entries.get(key);
      if (!e) return;
      e.handlers.delete(handler);
      if (e.handlers.size === 0) {
        this.entries.delete(key);
        this.sendSub('unsubscribe', subscription);
      }
    };
  }

  /** Tear down the socket and all subscriptions. */
  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.entries.clear();
    this.ws?.close();
    this.ws = null;
    this.opened = false;
  }

  private ensureConnected(): void {
    if (this.ws) return;
    this.closedByUser = false;
    console.log('[DBG ws] connecting', this.url);
    let ws: WsLike;
    try {
      ws = this.wsFactory(this.url);
    } catch (e) {
      console.log('[DBG ws] factory threw', (e as Error)?.message);
      throw e;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.opened = true;
      this.reconnectAttempts = 0;
      console.log('[DBG ws] OPEN; (re)subscribing', this.entries.size, 'feeds');
      // (Re)subscribe to everything currently registered.
      for (const entry of this.entries.values()) this.sendSub('subscribe', entry.subscription);
    };
    ws.onmessage = (ev) => this.handleMessage(ev.data);
    ws.onclose = () => { console.log('[DBG ws] CLOSE'); this.handleClose(); };
    ws.onerror = (e) => { console.log('[DBG ws] ERROR', e); this.ws?.close(); };
  }

  private handleClose(): void {
    this.opened = false;
    this.ws = null;
    if (this.closedByUser || this.entries.size === 0) return;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_MS);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => this.ensureConnected(), delay);
  }

  private sendSub(method: 'subscribe' | 'unsubscribe', subscription: Subscription): void {
    if (!this.ws || !this.opened) { console.log('[DBG ws] defer', method, subscription.type, '(not open yet)'); return; }
    console.log('[DBG ws] send', method, subscription.type);
    this.ws.send(JSON.stringify({ method, subscription }));
  }

  private handleMessage(raw: unknown): void {
    let msg: { channel?: string; data?: unknown };
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch {
      return;
    }
    if (!msg.channel || msg.channel === 'subscriptionResponse' || msg.channel === 'pong') return;

    // `trades` delivers an array of trades; the coin lives on each element.
    const raw0 = Array.isArray(msg.data) ? (msg.data[0] as { coin?: unknown } | undefined) : undefined;
    const data = (raw0 ?? msg.data) as { coin?: unknown; user?: unknown } | undefined;
    const key = routingKey({ channel: msg.channel, coin: data?.coin, user: data?.user });
    const entry = this.entries.get(key);
    if (!entry) {
      if (msg.channel !== 'l2Book' && msg.channel !== 'allMids' && msg.channel !== 'trades') {
        console.log('[DBG ws] msg', msg.channel, 'key=', key, '→ NO matching handler. keys:', [...this.entries.keys()]);
      }
      return;
    }
    if (msg.channel !== 'l2Book' && msg.channel !== 'allMids' && msg.channel !== 'trades') {
      console.log('[DBG ws] msg', msg.channel, '→ handler matched');
    }
    entry.last = msg.data;
    for (const handler of entry.handlers) handler(msg.data);
  }
}
