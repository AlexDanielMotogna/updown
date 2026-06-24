/**
 * tradeMath — single source of truth for per-trade numbers (position size,
 * margin, liquidation, fee, max size, quick-amounts). Pure functions so Simple
 * Mode and the Pro OrderEntry compute identically with zero drift (PLAN-SIMPLE-MODE
 * §2). UI decides when to show them; these just do the arithmetic.
 *
 * All money values are plain numbers in USD. `leverage` is the integer multiplier.
 */

export type TradeSide = 'BUY' | 'SELL';

/** Fee-estimate rates (decimals). HL base taker ≈ 0.045%; our builder fee 0.01%
 *  (HYPERLIQUID_BUILDER_FEE=10 tenths-bp). This is an ESTIMATE — a user on a
 *  volume tier pays less; the exact rate comes from HL at fill time. */
export const TAKER_FEE_RATE = 0.00045;
export const BUILDER_FEE_RATE = 0.0001;

/** Margin required to open `positionUsd` of notional at `leverage`. */
export function marginUsd(positionUsd: number, leverage: number): number {
  return leverage > 0 ? positionUsd / leverage : 0;
}

/** Largest notional the balance supports at `leverage` (buying power). */
export function maxPositionUsd(available: number, leverage: number): number {
  return Math.max(0, available) * leverage;
}

/** Estimated liquidation price for a fresh isolated-ish position. Mirrors the
 *  existing OrderEntry estimate: long liquidates below, short above. Returns null
 *  when inputs are missing. (A real cross-margin liq depends on the whole account;
 *  this is the same single-position estimate Pro already shows.) */
export function liquidationPrice(mark: number, side: TradeSide, leverage: number): number | null {
  if (!mark || !leverage) return null;
  return side === 'BUY' ? mark * (1 - 1 / leverage) : mark * (1 + 1 / leverage);
}

/** Estimated taker + builder fee on `positionUsd` of notional. */
export function estFee(positionUsd: number): number {
  return Math.max(0, positionUsd) * (TAKER_FEE_RATE + BUILDER_FEE_RATE);
}

/** Notional for a quick button (25 / 50 / 100 % of max buying power). */
export function quickPositionUsd(available: number, leverage: number, pct: number): number {
  return (maxPositionUsd(available, leverage) * pct) / 100;
}
