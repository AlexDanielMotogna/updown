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
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(baseUrl?: string, wsUrl?: string) {
    this.baseUrl = baseUrl || process.env.PACIFICA_API_URL || 'https://api.pacifica.fi';
    this.wsUrl = wsUrl || process.env.PACIFICA_WS_URL || 'wss://ws.pacifica.fi/ws';
  }

  /**
   * Get spot price for a symbol via REST API
   * Uses the oracle price for parimutuel pool resolution
   */
  async getSpotPrice(symbol: string): Promise<NormalizedPriceTick> {
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
    if (this.subscriptions.size === 0 && this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Connect to WebSocket and subscribe to prices channel
   */
  private connectWebSocket(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log('[Pacifica] WebSocket connected');
      this.reconnectAttempts = 0;

      // Subscribe to prices channel
      this.ws?.send(JSON.stringify({
        method: 'subscribe',
        params: {
          source: 'prices'
        }
      }));
    });

    this.ws.on('message', (data: WebSocket.Data) => {
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
   * Attempt to reconnect WebSocket with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.subscriptions.size === 0) {
      return; // No active subscriptions, don't reconnect
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Pacifica] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[Pacifica] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  /**
   * Normalize Pacifica price data to standard format
   * Uses oracle price for parimutuel pool resolution
   */
  private normalizePriceData(data: PacificaPriceData): NormalizedPriceTick {
    const rawData = JSON.stringify(data);
    const oraclePrice = parseFloat(data.oracle);

    return {
      symbol: data.symbol,
      // Convert to 6 decimal places (USDC precision)
      price: BigInt(Math.round(oraclePrice * 1_000_000)),
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
