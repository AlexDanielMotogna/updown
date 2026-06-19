/**
 * exchange-core — normalized types
 *
 * The superset of shapes the terminal UI consumes. Every exchange adapter maps
 * its raw payloads to these; the UI never sees raw HyperLiquid/Pacifica shapes.
 *
 * Conventions (lifted from docs/Terminal-Migration/18-server-adapter.md):
 *  - All numeric values are **strings** to preserve precision (never `number`,
 *    except where noted: leverage, funding intervals, counts).
 *  - All timestamps are **epoch milliseconds** (`number`).
 *  - Every type carries a `metadata: Record<string, unknown>` escape hatch for
 *    exchange-specific fields that don't fit the normalized shape.
 */

/** Exchanges this contract can resolve. Extend as adapters are added. */
export type ExchangeName = 'hyperliquid' | 'pacifica' | 'binance';

/** The settlement chain an exchange signs on (drives which WalletSigner is used). */
export type ChainKind = 'evm' | 'solana';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type OrderSide = 'BUY' | 'SELL';

export type OrderType =
  | 'MARKET'
  | 'LIMIT'
  | 'STOP_MARKET'
  | 'STOP_LIMIT'
  | 'TAKE_PROFIT_MARKET'
  | 'TAKE_PROFIT_LIMIT';

export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'POST_ONLY';

export type OrderStatus =
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED';

export type PositionSide = 'LONG' | 'SHORT';

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

export interface Market {
  symbol: string; // normalized "BTC-USD"
  baseAsset: string;
  quoteAsset: string;
  tickSize: string;
  stepSize: string;
  minOrderSize: string;
  maxOrderSize: string;
  minNotional: string;
  maxLeverage: number;
  fundingRate: string;
  fundingInterval: number; // hours
  metadata: Record<string, unknown>;
}

export interface Price {
  symbol: string;
  mark: string;
  index: string;
  last: string;
  bid: string;
  ask: string;
  funding: string;
  volume24h: string;
  change24h: string;
  timestamp: number;
}

/** `[price, size]` levels, best-first. */
export type OrderbookLevel = [string, string];

export interface Orderbook {
  symbol: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
}

export interface Candle {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface RecentTrade {
  id: string;
  symbol: string;
  side: OrderSide;
  price: string;
  amount: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Account (read)
// ---------------------------------------------------------------------------

export interface Account {
  accountId: string;
  balance: string;
  accountEquity: string;
  availableToSpend: string;
  marginUsed: string;
  unrealizedPnl: string;
  makerFee: string;
  takerFee: string;
  metadata: Record<string, unknown>;
}

export interface Position {
  symbol: string;
  side: PositionSide;
  amount: string;
  entryPrice: string;
  markPrice: string;
  margin: string;
  leverage: number;
  unrealizedPnl: string;
  liquidationPrice: string;
  funding: string;
  metadata: Record<string, unknown>;
}

export interface Order {
  orderId: string | number;
  clientOrderId?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: string;
  amount: string;
  filled: string;
  remaining: string;
  status: OrderStatus;
  timeInForce: TimeInForce;
  reduceOnly: boolean;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
}

export interface TradeHistoryItem {
  historyId: string;
  orderId: string | number;
  symbol: string;
  side: OrderSide;
  amount: string;
  price: string;
  fee: string;
  pnl: string | null;
  executedAt: number;
  metadata: Record<string, unknown>;
}

export interface AccountSetting {
  symbol: string;
  leverage: number;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Query param shapes (read adapter)
// ---------------------------------------------------------------------------

export interface KlineParams {
  symbol: string;
  interval: string; // e.g. "1m", "1h", "1d"
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface TradeHistoryParams {
  accountId: string;
  symbol?: string;
  startTime?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Order param shapes (signer)
// ---------------------------------------------------------------------------

export interface OrderParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  amount: string;
  /** Required for LIMIT / *_LIMIT orders. */
  price?: string;
  /** Required for STOP_* / TAKE_PROFIT_* orders. */
  triggerPrice?: string;
  timeInForce?: TimeInForce;
  reduceOnly?: boolean;
  clientOrderId?: string;
  /** Max slippage for market-type orders, as a percent (e.g. 8 = 8%). The
   * adapter derives the worst-acceptable price from this; defaults if omitted. */
  maxSlippagePct?: number;
}

export interface CancelParams {
  symbol: string;
  orderId: string | number;
}

/** Generic write result for cancel / leverage / etc. */
export interface Result {
  success: boolean;
  metadata?: Record<string, unknown>;
}

export interface OrderResult {
  orderId: string | number;
  status: OrderStatus;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Realtime (stream face)
// ---------------------------------------------------------------------------

/** A normalized account-channel event from the realtime stream. */
export type AccountEvent =
  | { kind: 'account'; account: Account }
  | { kind: 'positions'; positions: Position[] }
  | { kind: 'orders'; orders: Order[] }
  | { kind: 'fill'; fill: TradeHistoryItem };
