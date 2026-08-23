import { IMarketDataProvider } from './interface';
import { NormalizedPriceTick } from '../types';
import crypto from 'crypto';
import WebSocket from 'ws';

/**
 * Hyperliquid market data provider.
 * REST:      https://api.hyperliquid.xyz  (POST /info { type: 'allMids' })
 * WebSocket: wss://api.hyperliquid.xyz/ws  (subscription { type: 'allMids' })
 *
 * `allMids` streams the mid price for every perp coin as a flat map
 * ({ BTC: "62345.0", ETH: "...", ... }). Coin names match our symbols (BTC/ETH/SOL)
 * 1:1, so no mapping is needed. Prices are normalized to 6-decimal micro-USD, the
 * same scale as Pacifica, so the resolver/strike comparison is unaffected.
 *
 * Prices always come from Hyperliquid MAINNET regardless of the Solana cluster —
 * we want real market prices to settle pools, not testnet quotes.
 */
export class HyperliquidProvider implements IMarketDataProvider {
  private baseUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, (tick: NormalizedPriceTick) => void> = new Map();
  private priceCache: Map<string, string> = new Map(); // symbol -> mid (string)
  private reconnectAttempts = 0;
  private reconnectDelay = 1000;
  /** Backoff ceiling; attempts are unbounded while subscriptions exist. */
  private maxReconnectDelay = 30_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMessageAt = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatIntervalMs = 15_000;
  private silenceTimeoutMs = 45_000;

  constructor(baseUrl?: string, wsUrl?: string) {
    this.baseUrl = baseUrl || process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz';
    this.wsUrl = wsUrl || process.env.HYPERLIQUID_WS_URL || 'wss://api.hyperliquid.xyz/ws';
  }

  /** POST /info { type: 'allMids' } → flat { coin: midString } map. */
  private async fetchAllMids(): Promise<Record<string, string>> {
    const response = await fetch(`${this.baseUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
    });
    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status} ${response.statusText}`);
    }
    const result = await response.json();
    // REST returns a flat map; some SDK shapes wrap it in { mids: {...} }.
    const mids = (result && typeof result === 'object' && 'mids' in result)
      ? (result as { mids: Record<string, string> }).mids
      : (result as Record<string, string>);
    if (!mids || typeof mids !== 'object') {
      throw new Error('Hyperliquid API error: unexpected allMids response');
    }
    return mids;
  }

  async getSpotPrice(symbol: string): Promise<NormalizedPriceTick> {
    return this.fetchWithRetry(async () => {
      const mids = await this.fetchAllMids();
      const mid = mids[symbol];
      if (mid == null) throw new Error(`Symbol ${symbol} not found in Hyperliquid mids`);
      return this.normalize(symbol, mid);
    }, `getSpotPrice(${symbol})`);
  }

  private async fetchWithRetry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries = 3,
    initialDelayMs = 500,
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Don't retry on logic errors or rate limits (retrying 429 just makes it worse).
        if (lastError.message.includes('not found in Hyperliquid mids') || lastError.message.includes('429')) {
          throw lastError;
        }
        if (attempt < maxRetries) {
          const delay = initialDelayMs * Math.pow(2, attempt);
          console.warn(`[Hyperliquid] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, lastError.message);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError!;
  }

  async getAllPrices(): Promise<NormalizedPriceTick[]> {
    const mids = await this.fetchAllMids();
    return Object.entries(mids).map(([symbol, mid]) => this.normalize(symbol, mid));
  }

  subscribe(symbol: string, callback: (tick: NormalizedPriceTick) => void): void {
    this.subscriptions.set(symbol, callback);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connectWebSocket();
    }
  }

  unsubscribe(symbol: string): void {
    this.subscriptions.delete(symbol);
    if (this.subscriptions.size === 0) {
      this.stopHeartbeat();
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    }
  }

  private connectWebSocket(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log('[Hyperliquid] WebSocket connected');
      this.reconnectAttempts = 0;
      this.lastMessageAt = Date.now();
      this.startHeartbeat();
      this.ws?.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'allMids' } }));
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.lastMessageAt = Date.now();
      try {
        const message = JSON.parse(data.toString());
        if (message?.channel === 'allMids' && message?.data?.mids && typeof message.data.mids === 'object') {
          this.handleMidsUpdate(message.data.mids as Record<string, string>);
        }
      } catch (error) {
        console.error('[Hyperliquid] Failed to parse WebSocket message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('[Hyperliquid] WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('[Hyperliquid] WebSocket closed');
      this.attemptReconnect();
    });
  }

  private handleMidsUpdate(mids: Record<string, string>): void {
    for (const [symbol, mid] of Object.entries(mids)) {
      this.priceCache.set(symbol, mid);
      const callback = this.subscriptions.get(symbol);
      if (callback) callback(this.normalize(symbol, mid));
    }
  }

  /** Silence watchdog — allMids streams continuously, so quiet means dead. */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.subscriptions.size === 0) return;
      const silentFor = Date.now() - this.lastMessageAt;
      if (silentFor > this.silenceTimeoutMs) {
        console.warn(`[Hyperliquid] no messages for ${silentFor}ms — forcing reconnect`);
        this.stopHeartbeat();
        try { this.ws?.terminate(); } catch { /* already gone */ }
        this.ws = null;
        this.attemptReconnect();
      } else {
        try { this.ws?.ping(); } catch { /* not open yet */ }
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  /**
   * Unbounded reconnect with capped backoff. It used to give up after 5 attempts,
   * which silently ends the price feed for the rest of the process's life — the
   * failure mode that froze resolution for 15 hours on the Pacifica provider.
   */
  private attemptReconnect(): void {
    if (this.subscriptions.size === 0) return;
    if (this.reconnectTimer) return;
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 10)),
      this.maxReconnectDelay,
    );
    if (this.reconnectAttempts <= 5 || this.reconnectAttempts % 20 === 0) {
      console.log(`[Hyperliquid] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, delay);
  }

  /** ms epoch of the last message on the price socket (0 = never). */
  getLastMessageAt(): number {
    return this.lastMessageAt;
  }

  /** Normalize a mid price string to the shared 6-decimal micro-USD tick. */
  private normalize(symbol: string, mid: string): NormalizedPriceTick {
    const price = parseFloat(mid);
    return {
      symbol,
      price: BigInt(Math.round(price * 1_000_000)),
      timestamp: new Date(),
      source: 'hyperliquid',
      rawHash: crypto.createHash('sha256').update(`${symbol}:${mid}`).digest('hex'),
    };
  }

  getCachedPrice(symbol: string): NormalizedPriceTick | null {
    const cached = this.priceCache.get(symbol);
    if (cached == null) return null;
    return this.normalize(symbol, cached);
  }

  getName(): string {
    return 'hyperliquid';
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.fetchAllMids();
      return true;
    } catch {
      return false;
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.priceCache.clear();
  }
}
