/** Client helpers for the UpDown API (apps/api). Trading writes go through the
 * server (it holds the encrypted agent key); the browser never signs orders. */
import type { OrderSide, OrderType } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

/** Whether this terminal targets HyperLiquid testnet (default true for now). */
export const IS_TESTNET = process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET !== 'false';

export interface PlaceOrderInput {
  walletAddress: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  amount: string;
  price?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'POST_ONLY';
  reduceOnly?: boolean;
}

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as ApiResult<T>;
  } catch (e) {
    return { success: false, error: { code: 'NETWORK', message: (e as Error).message } };
  }
}

export interface OrderResult {
  orderId: string | number;
  status: string;
}

export function placeOrder(input: PlaceOrderInput) {
  return post<OrderResult>('/api/exchange/order', { ...input, isTestnet: IS_TESTNET });
}

export function cancelOrder(input: { walletAddress: string; symbol: string; orderId: string | number }) {
  return post<{ success: boolean }>('/api/exchange/order/cancel', { ...input, isTestnet: IS_TESTNET });
}
