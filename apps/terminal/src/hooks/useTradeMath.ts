'use client';

import { useMemo } from 'react';
import { estFee, liquidationPrice, type TradeSide } from '@/lib/tradeMath';

export interface TradeMathInput {
  side: TradeSide;
  leverage: number;
  /** Current mark price of the market. */
  mark: number;
  /** Buying power (account equity − margin used), in USD. */
  available: number;
  /** What the user typed, in USD — the REAL money they put in (collateral). */
  amountUsd: string | number;
}

export interface TradeMath {
  /** Real money the user puts in (collateral / cost) — equals the typed amount. */
  cost: number;
  /** Resulting position size / notional (cost × leverage). */
  positionUsd: number;
  /** Max real money they can put in (their available balance). */
  maxUsd: number;
  /** Estimated liquidation price (null when not computable). */
  liquidationPrice: number | null;
  /** Estimated taker + builder fee on the notional (USD). */
  estFee: number;
  /** True when the cost exceeds the available balance. */
  exceedsBalance: boolean;
  /** Real money for a quick % button (25 / 50 / 100 % of available). */
  quickUsd: (pct: number) => number;
}

/**
 * Derived trade numbers for the Simple order form (PLAN-SIMPLE-MODE §2). The typed
 * amount is the REAL money the user puts in (collateral); the position size is that
 * × leverage. Keeping the amount = money-in (not notional) is the clarity the
 * Robinhood-style UX needs.
 */
export function useTradeMath({ side, leverage, mark, available, amountUsd }: TradeMathInput): TradeMath {
  return useMemo(() => {
    const cost = Number(amountUsd) || 0;
    const maxUsd = Math.max(0, available);
    return {
      cost,
      positionUsd: cost * leverage,
      maxUsd,
      liquidationPrice: liquidationPrice(mark, side, leverage),
      estFee: estFee(cost * leverage),
      exceedsBalance: cost > maxUsd + 1e-9,
      quickUsd: (pct: number) => (maxUsd * pct) / 100,
    };
  }, [side, leverage, mark, available, amountUsd]);
}
