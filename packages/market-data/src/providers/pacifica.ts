import { IMarketDataProvider } from './interface';
import { NormalizedPriceTick } from '../types';
import crypto from 'crypto';
import WebSocket from 'ws';

/**
 * Pacifica API response types
 */
interface PacificaPriceData {
  symbol: string;
  oracle: string;
  mark: string;
  mid: string;
  funding: string;
  next_funding: string;
  open_interest: string;
  volume_24h: string;
  yesterday_price: string;
  timestamp: number;
}

interface PacificaApiResponse<T> {
  success: boolean;
  data: T;
  error: string | null;
  code: string | null;
}

interface PacificaWsMessage {
  channel: string;
  data: PacificaPriceData[];
}

/**
 * Pacifica market data provider implementation
 * REST API: https://api.pacifica.fi
 * WebSocket: wss://ws.pacifica.fi/ws
 */
export class PacificaProvider implements IMarketDataProvider {
  private baseUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, (tick: NormalizedPriceTick) => void> = new Map();
  private priceCache: Map<string, PacificaPriceData> = new Map();
  private reconnectAttempts = 0;
  private reconnectDelay = 1000;
  /** Backoff ceiling. We retry FOREVER while subscriptions exist (see attemptReconnect). */
  private maxReconnectDelay = 30_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Liveness: ms epoch of the last message from the socket, and the watchdog timer. */
  private lastMessageAt = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatIntervalMs = 15_000;
  private silenceTimeoutMs = 45_000;

  constructor(baseUrl?: string, wsUrl?: string) {
    this.baseUrl = baseUrl || process.env.PACIFICA_API_URL || 'https://api.pacifica.fi';
    this.wsUrl = wsUrl || process.env.PACIFICA_WS_URL || 'wss://ws.pacifica.fi/ws';
  }

  /**
   * Get spot price for a symbol via REST API
   * Uses the oracle price for parimutuel pool resolution
   * Retries up to 3 times with exponential backoff on transient errors.
   */
  async getSpotPrice(symbol: string): Promise<NormalizedPriceTick> {
    return this.fetchWithRetry(async () => {
      const url = `${this.baseUrl}/api/v1/info/prices`;

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Pacifica API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as PacificaApiResponse<PacificaPriceData[]>;

      if (!result.success || !result.data) {
        throw new Error(`Pacifica API error: ${result.error || 'Unknown error'}`);
      }

      const priceData = result.data.find(p => p.symbol === symbol);
      if (!priceData) {
        throw new Error(`Symbol ${symbol} not found in Pacifica prices`);
      }

      return this.normalizePriceData(priceData);
    }, `getSpotPrice(${symbol})`);
  }

  /**
   * Retry a fetch operation with exponential backoff.
   * Does NOT retry on "symbol not found" errors (logic errors, not transient).
   */
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

        // Don't retry on logic errors or rate limits (retrying 429 just makes it worse)
        if (lastError.message.includes('not found in Pacifica prices') ||
            lastError.message.includes('429')) {
          throw lastError;
        }

        if (attempt < maxRetries) {
          const delay = initialDelayMs * Math.pow(2, attempt);
          console.warn(`[Pacifica] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, lastError.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Get all available prices
   */
  async getAllPrices(): Promise<NormalizedPriceTick[]> {
    const url = `${this.baseUrl}/api/v1/info/prices`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Pacifica API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as PacificaApiResponse<PacificaPriceData[]>;

    if (!result.success || !result.data) {
      throw new Error(`Pacifica API error: ${result.error || 'Unknown error'}`);
    }

    return result.data.map(p => this.normalizePriceData(p));
  }

  /**
   * Subscribe to real-time price updates via WebSocket
   */
  subscribe(symbol: string, callback: (tick: NormalizedPriceTick) => void): void {
    this.subscriptions.set(symbol, callback);

    // Initialize WebSocket if not connected
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connectWebSocket();
    }
  }

  /**
   * Unsubscribe from price updates
   */
  unsubscribe(symbol: string): void {
    this.subscriptions.delete(symbol);

    // Close WebSocket if no more subscriptions
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

  /**
   * ms epoch of the last message received on the price socket (0 = never). Lets
   * callers tell "feed alive" from "feed silent" without reaching into the socket.
   */
  getLastMessageAt(): number {
    return this.lastMessageAt;
  }

  /**
   * Connect to WebSocket and subscribe to prices channel
   */
  private connectWebSocket(): void {
    // Avoid duplicate connections - also skip if already CONNECTING
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log('[Pacifica] WebSocket connected');
      this.reconnectAttempts = 0;
      this.lastMessageAt = Date.now();
      this.startHeartbeat();

      // Subscribe to prices channel
      this.ws?.send(JSON.stringify({
        method: 'subscribe',
        params: {
          source: 'prices'
        }
      }));
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.lastMessageAt = Date.now();
      try {
        const message: PacificaWsMessage = JSON.parse(data.toString());

        if (message.channel === 'prices' && Array.isArray(message.data)) {
          this.handlePricesUpdate(message.data);
        }
      } catch (error) {
        console.error('[Pacifica] Failed to parse WebSocket message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('[Pacifica] WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('[Pacifica] WebSocket closed');
      this.attemptReconnect();
    });
  }

  /**
   * Handle incoming price updates from WebSocket
   */
  private handlePricesUpdate(prices: PacificaPriceData[]): void {
    for (const priceData of prices) {
      // Update cache
      this.priceCache.set(priceData.symbol, priceData);

      // Notify subscribers
      const callback = this.subscriptions.get(priceData.symbol);
      if (callback) {
        const normalized = this.normalizePriceData(priceData);
        callback(normalized);
      }
    }
  }

  /**
   * Liveness watchdog. Pacifica pushes prices continuously, so silence means the
   * socket is dead even when no 'close' event ever fires (half-open connection
   * behind a proxy/NAT drop). Without this, the feed goes quiet, no reconnect is
   * ever attempted, and the resolver keeps reading a frozen tick buffer.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.subscriptions.size === 0) return;
      const silentFor = Date.now() - this.lastMessageAt;
      if (silentFor > this.silenceTimeoutMs) {
        console.warn(`[Pacifica] no messages for ${silentFor}ms — forcing reconnect`);
        this.stopHeartbeat();
        try { this.ws?.terminate(); } catch { /* already gone */ }
        this.ws = null;
        this.attemptReconnect();
      } else {
        // Cheap keepalive so idle proxies don't drop us in the first place.
        try { this.ws?.ping(); } catch { /* not open yet */ }
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  /**
   * Reconnect with exponential backoff, capped and UNBOUNDED in attempts.
   *
   * This used to give up permanently after 5 tries (~31 s of total backoff), which
   * meant any Pacifica outage longer than half a minute killed the price feed until
   * someone restarted the API. On 2026-08-23 that stranded the tick buffer for 15
   * hours and every crypto pool resolved against a stale price. A price feed must
   * keep trying for as long as anything is subscribed.
   */
  private attemptReconnect(): void {
    if (this.subscriptions.size === 0) {
      return; // No active subscriptions, don't reconnect
    }
    if (this.reconnectTimer) return; // one pending attempt at a time

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 10)),
      this.maxReconnectDelay,
    );

    // Loud once, then quiet: a long outage shouldn't flood the logs every 30 s.
    if (this.reconnectAttempts <= 5 || this.reconnectAttempts % 20 === 0) {
      console.log(`[Pacifica] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, delay);
  }

  /**
   * Normalize Pacifica price data to standard format
   * Uses mark price for display and pool resolution
   */
  private normalizePriceData(data: PacificaPriceData): NormalizedPriceTick {
    const rawData = JSON.stringify(data);
    const markPrice = parseFloat(data.mark);

    return {
      symbol: data.symbol,
      // Convert to 6 decimal places (USDC precision)
      price: BigInt(Math.round(markPrice * 1_000_000)),
      timestamp: new Date(data.timestamp),
      source: 'pacifica',
      rawHash: crypto.createHash('sha256').update(rawData).digest('hex'),
    };
  }

  /**
   * Get cached price for a symbol (from WebSocket updates)
   */
  getCachedPrice(symbol: string): NormalizedPriceTick | null {
    const cached = this.priceCache.get(symbol);
    if (!cached) return null;
    return this.normalizePriceData(cached);
  }

  getName(): string {
    return 'pacifica';
  }

  /**
   * Check if provider is healthy by making a test API call
   */
  async isHealthy(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/api/v1/info/prices`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Disconnect WebSocket and cleanup
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.priceCache.clear();
  }
}
