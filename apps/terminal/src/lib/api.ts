/** Client helpers for the UpDown API (apps/api). Trading writes go through the
 * server (it holds the encrypted agent key); the browser never signs orders. */
import type { OrderSide, OrderType } from './types';

/** API base. If the page is served over HTTPS but the env URL is http:// (and not
 * localhost), upgrade it — otherwise the browser blocks the call as mixed content. */
function apiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && raw.startsWith('http://') && !raw.includes('localhost')) {
    return raw.replace(/^http:\/\//, 'https://');
  }
  return raw;
}
const API_BASE = apiBase();

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
  /** 'perp' (default) or 'spot'. Spot routes to the spot asset map server-side. */
  kind?: 'perp' | 'spot';
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

export interface TpslResult {
  results: Array<{ success: boolean; orderId?: number; error?: string }>;
}

/** Set Take Profit / Stop Loss as a HyperLiquid `positionTpsl` group — HL ties
 * them to the position (OCO + auto-cancel on close). `side` is the CLOSING side
 * (opposite of the position). */
export function setTpsl(input: {
  walletAddress: string;
  symbol: string;
  side: OrderSide;
  amount: string;
  tpTriggerPrice?: string;
  slTriggerPrice?: string;
  maxSlippagePct?: number;
}) {
  return post<TpslResult>('/api/exchange/order/tpsl', { ...input, isTestnet: IS_TESTNET });
}

/** Set leverage + margin mode (cross/isolated) for a symbol on HyperLiquid.
 * Signed server-side by the agent key — no per-change browser popup. */
export function setLeverage(input: { walletAddress: string; symbol: string; leverage: number; isCross: boolean }) {
  return post<{ success: boolean }>('/api/exchange/leverage', { ...input, isTestnet: IS_TESTNET });
}

/** Near-instant trading-reward crediting: ping the API after a fill; it
 * re-verifies via userFills and credits XP + UP coins. Server-verified. */
export function creditFills(walletAddress: string) {
  return post<{ newFills: number; xpAwarded: number; coinsAwarded: number; level: number; levelUp: boolean }>(
    '/api/exchange/credit-fills',
    { walletAddress, isTestnet: IS_TESTNET },
  );
}

// ── Bridge (cross-chain funding) ──────────────────────────────────────────

export interface BridgeQuote {
  provider: string;
  tool: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  feeUsd: string;
  gasUsd: string;
  durationSeconds: number;
}

/** Quote a Solana USDC → Arbitrum USDC transfer (phase 1: preview only).
 *  `amountMicro` is base units (USDC = 6 decimals). */
export async function getBridgeQuote(params: {
  amountMicro: string;
  fromAddress: string;
  toAddress: string;
}): Promise<ApiResult<BridgeQuote>> {
  try {
    const qs = new URLSearchParams({
      amount: params.amountMicro,
      fromAddress: params.fromAddress,
      toAddress: params.toAddress,
    });
    const res = await fetch(`${API_BASE}/api/bridge/quote?${qs.toString()}`, { cache: 'no-store' });
    return (await res.json()) as ApiResult<BridgeQuote>;
  } catch (e) {
    return { success: false, error: { code: 'NETWORK_ERROR', message: e instanceof Error ? e.message : 'Network error' } };
  }
}

export interface BridgeSourceTx {
  chain: string;
  /** base64-serialized source-chain tx to sign & send. */
  data: string;
}
export interface BridgeExecuteResult {
  id: string;
  sourceTx: BridgeSourceTx;
  quote: { toAmount: string; toAmountMin: string; feeUsd: string; gasUsd: string; durationSeconds: number; tool: string };
}

/** Start a transfer: fresh quote + the signable Solana tx + a durable id. */
export async function executeBridge(params: { amountMicro: string; fromAddress: string; toAddress: string }): Promise<ApiResult<BridgeExecuteResult>> {
  return post<BridgeExecuteResult>('/api/bridge/execute', {
    amount: params.amountMicro, fromAddress: params.fromAddress, toAddress: params.toAddress,
  });
}

/** Record the Solana source-tx signature so the backend can poll status. */
export async function markBridgeSubmitted(params: { id: string; txHash: string }): Promise<ApiResult<{ id: string; status: string }>> {
  return post<{ id: string; status: string }>('/api/bridge/submitted', params);
}

/** Poll a transfer's normalized status. */
export async function getBridgeStatus(id: string): Promise<ApiResult<{ id: string; status: string; destTxHash?: string; substatus?: string }>> {
  try {
    const res = await fetch(`${API_BASE}/api/bridge/status?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    return (await res.json()) as ApiResult<{ id: string; status: string; destTxHash?: string; substatus?: string }>;
  } catch (e) {
    return { success: false, error: { code: 'NETWORK_ERROR', message: e instanceof Error ? e.message : 'Network error' } };
  }
}

/** Relayer deposits the user's permitted USDC into HyperLiquid (last mile). */
export async function depositHl(params: {
  user: string;
  usd: string;
  deadline: number;
  signature: { r: string; s: string; v: number };
}): Promise<ApiResult<{ txHash: string }>> {
  return post<{ txHash: string }>('/api/bridge/deposit-hl', params);
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

export interface UserProfile {
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  level: number;
  title: string;
  totalXp: string;
  xpForCurrentLevel: string;
  xpForNextLevel: string;
  xpProgress: number; // 0..1
  nextLevel: { level: number; title: string } | null;
  coinsBalance: string;
}

/** UpDown profile (level / XP / UP coins) for an identity wallet, or null. */
export async function fetchProfile(walletAddress: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${API_BASE}/api/users/profile?wallet=${encodeURIComponent(walletAddress)}`, { cache: 'no-store' });
    const json = (await res.json()) as ApiResult<UserProfile>;
    return json.success ? (json.data ?? null) : null;
  } catch {
    return null;
  }
}

export interface DbNotification {
  id: string;
  walletAddress: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  read: boolean;
  createdAt: string;
  poolId?: string | null;
  poolType?: string | null;
}

/** Unread + recent notifications for a wallet (same store as the app). */
export async function fetchNotifications(wallet: string): Promise<DbNotification[]> {
  try {
    const res = await fetch(`${API_BASE}/api/notifications?wallet=${encodeURIComponent(wallet)}`, { cache: 'no-store' });
    const json = (await res.json()) as ApiResult<DbNotification[]>;
    return json.success ? (json.data ?? []) : [];
  } catch {
    return [];
  }
}

export function markNotificationRead(id: string) {
  return fetch(`${API_BASE}/api/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
}

export function markAllNotificationsRead(wallet: string) {
  return fetch(`${API_BASE}/api/notifications/read-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  }).catch(() => {});
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
