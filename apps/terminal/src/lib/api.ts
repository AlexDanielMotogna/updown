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
  triggerPrice?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'POST_ONLY';
  reduceOnly?: boolean;
  maxSlippagePct?: number;
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

/** Set leverage + margin mode (cross/isolated) for a symbol on HyperLiquid.
 * Signed server-side by the agent key — no per-change browser popup. */
export function setLeverage(input: { walletAddress: string; symbol: string; leverage: number; isCross: boolean }) {
  return post<{ success: boolean }>('/api/exchange/leverage', { ...input, isTestnet: IS_TESTNET });
}

// ── Identity + agent lifecycle ────────────────────────────────────────────

/** Resolve a linked wallet → the Solana identity (walletAddress) or null. */
export async function resolveIdentity(evmAddress: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/exchange/resolve?chain=evm&address=${encodeURIComponent(evmAddress)}`,
      { cache: 'no-store' }
    );
    const json = (await res.json()) as ApiResult<{ walletAddress: string } | null>;
    return json.success ? (json.data?.walletAddress ?? null) : null;
  } catch {
    return null;
  }
}

export interface ConnectionStatus {
  exchange: string;
  accountAddress: string;
  agentAddress: string;
  active: boolean;
  isTestnet: boolean;
}

export async function getConnection(walletAddress: string): Promise<ConnectionStatus | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/exchange/connection?wallet=${encodeURIComponent(walletAddress)}&isTestnet=${IS_TESTNET}`,
      { cache: 'no-store' }
    );
    const json = (await res.json()) as ApiResult<ConnectionStatus | null>;
    return json.success ? (json.data ?? null) : null;
  } catch {
    return null;
  }
}

/** Ensure a User exists for a Solana wallet (idempotent upsert). */
export function registerUser(walletAddress: string) {
  return post<unknown>('/api/users/register', { walletAddress });
}

/** Link an EVM wallet to a Solana identity (needs the Solana walletAddress). */
export function linkEvm(walletAddress: string, evmAddress: string, source?: string) {
  return post<{ chain: string; address: string }>('/api/exchange/link', {
    walletAddress,
    chain: 'evm',
    address: evmAddress,
    source,
  });
}

/** Step 1: server generates a pending agent, returns its address to approve. */
export function generateAgent(walletAddress: string, accountAddress: string) {
  return post<{ agentAddress: `0x${string}` }>('/api/exchange/agent/generate', {
    walletAddress,
    accountAddress,
    isTestnet: IS_TESTNET,
  });
}

/** Step 3: activate the connection after on-chain approveAgent. */
export function confirmAgent(walletAddress: string) {
  return post<ConnectionStatus>('/api/exchange/agent/confirm', { walletAddress, isTestnet: IS_TESTNET });
}
