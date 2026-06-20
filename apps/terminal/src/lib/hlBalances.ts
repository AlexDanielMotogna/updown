/** Read-only HyperLiquid balance helpers for the deposit/transfer/withdraw modals. */
import { IS_TESTNET } from './api';

const HL_API =
  process.env.NEXT_PUBLIC_HYPERLIQUID_API_URL ??
  (IS_TESTNET ? 'https://api.hyperliquid-testnet.xyz' : 'https://api.hyperliquid.xyz');

async function info<T>(body: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(`${HL_API}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** USDC available to move out of the Perp account (withdrawable). */
export async function fetchPerpsWithdrawable(user: string): Promise<number> {
  const s = await info<{ withdrawable?: string }>({ type: 'clearinghouseState', user });
  return Number(s?.withdrawable ?? 0);
}

/** The user's perps maker/taker fee rates (decimals, e.g. 0.00015 = 0.015%). */
export async function fetchUserFees(user: string): Promise<{ maker: number; taker: number } | null> {
  const s = await info<{ userAddRate?: string; userCrossRate?: string }>({ type: 'userFees', user });
  if (!s) return null;
  return { maker: Number(s.userAddRate ?? 0), taker: Number(s.userCrossRate ?? 0) };
}

/** USDC sitting in the Spot account. */
export async function fetchSpotUsdc(user: string): Promise<number> {
  const s = await info<{ balances?: Array<{ coin: string; total: string }> }>({
    type: 'spotClearinghouseState',
    user,
  });
  const usdc = s?.balances?.find((b) => b.coin === 'USDC');
  return Number(usdc?.total ?? 0);
}
