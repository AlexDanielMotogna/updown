'use client';

import { useMemo } from 'react';
import {
  estFee,
  liquidationPrice,
  marginUsd,
  maxPositionUsd,
  quickPositionUsd,
  type TradeSide,
} from '@/lib/tradeMath';

export interface TradeMathInput {
  side: TradeSide;
  leverage: number;
  /** Current mark price of the market. */
  mark: number;
  /** Buying power (account equity − margin used), in USD. */
  available: number;
  /** The amount the user typed, in USD (decimal string or number). */
  amountUsd: string | number;
}

export interface TradeMath {
  /** Notional the user is opening (USD). */
  positionUsd: number;
  /** Margin locked for it (USD). */
  margin: number;
  /** Max notional the balance supports at this leverage (USD). */
  maxUsd: number;
  /** Estimated liquidation price (null when not computable). */
  liquidationPrice: number | null;
  /** Estimated taker + builder fee (USD). */
  estFee: number;
  /** True when the requested notional exceeds buying power. */
  exceedsBalance: boolean;
  /** Notional for a quick % button (25 / 50 / 100). */
  quickUsd: (pct: number) => number;
}

/**
 * Derived trade numbers for a Simple/Pro order form. Pure math (from lib/tradeMath)
 * memoized over the inputs — see PLAN-SIMPLE-MODE §2.
 */
export function useTradeMath({ side, leverage, mark, available, amountUsd }: TradeMathInput): TradeMath {
  return useMemo(() => {
    const positionUsd = Number(amountUsd) || 0;
    const maxUsd = maxPositionUsd(available, leverage);
    return {
      positionUsd,
      margin: marginUsd(positionUsd, leverage),
      maxUsd,
      liquidationPrice: liquidationPrice(mark, side, leverage),
      estFee: estFee(positionUsd),
      exceedsBalance: positionUsd > maxUsd + 1e-9,
      quickUsd: (pct: number) => quickPositionUsd(available, leverage, pct),
    };
  }, [side, leverage, mark, available, amountUsd]);
}
