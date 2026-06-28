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

/** The user's maker/taker fee rates (decimals, e.g. 0.00015 = 0.015%). HL charges
 * different rates for perps vs spot (spot is higher: 0.04%/0.07% base vs
 * 0.015%/0.045%), so return both. */
export async function fetchUserFees(
  user: string,
): Promise<{ maker: number; taker: number; spotMaker: number; spotTaker: number } | null> {
  const s = await info<{
    userAddRate?: string;
    userCrossRate?: string;
    userSpotAddRate?: string;
    userSpotCrossRate?: string;
  }>({ type: 'userFees', user });
  if (!s) return null;
  return {
    maker: Number(s.userAddRate ?? 0),
    taker: Number(s.userCrossRate ?? 0),
    spotMaker: Number(s.userSpotAddRate ?? 0),
    spotTaker: Number(s.userSpotCrossRate ?? 0),
  };
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

type SpotState = { balances?: Array<{ coin: string; token: number; total: string }> };
type SpotMetaCtx = [
  { universe: Array<{ name: string; tokens: number[] }> },
  Array<{ coin: string; markPx?: string }>,
];

/** Total Spot account value in USD = USDC + each token's balance × its USDC pair
 * mark. Mirrors HL's "Spot" equity (USDC-only balance undervalues it). */
export async function fetchSpotAccountValue(user: string): Promise<number | null> {
  const [state, mc] = await Promise.all([
    info<SpotState>({ type: 'spotClearinghouseState', user }),
    info<SpotMetaCtx>({ type: 'spotMetaAndAssetCtxs' }),
  ]);
  if (!state?.balances) return null;
  let total = 0;
  if (mc) {
    const [meta, ctxs] = mc;
    const ctxByCoin = new Map(ctxs.map((c) => [c.coin, c]));
    // tokenIndex → mark of its canonical USDC pair (quote token index 0 = USDC).
    const markByToken = new Map<number, number>();
    for (const p of meta.universe) {
      if (p.tokens[1] === 0) {
        const ctx = ctxByCoin.get(p.name);
        if (ctx?.markPx) markByToken.set(p.tokens[0], Number(ctx.markPx));
      }
    }
    for (const b of state.balances) {
      if (b.coin === 'USDC') total += Number(b.total);
      else {
        const px = markByToken.get(b.token);
        if (px) total += Number(b.total) * px;
      }
    }
  }
  return total;
}
