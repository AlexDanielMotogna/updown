/**
 * Order formatting for HyperLiquid (tick/lot rules) + normalized→HL mapping.
 *
 * HL price rules (docs: tick-and-lot-size): a price may have at most 5
 * significant figures AND at most (6 - szDecimals) decimal places for perps;
 * integers are always allowed. Trailing zeroes must be removed before signing.
 * Sizes are rounded to szDecimals decimals.
 */
import type { OrderParams, TimeInForce } from 'exchange-core';

const PERP_MAX_DECIMALS = 6;
const SPOT_MAX_DECIMALS = 8;
const MAX_SIG_FIGS = 5;

/** HL price decimal cap: MAX_DECIMALS - szDecimals, MAX_DECIMALS = 6 perp / 8 spot. */
export function maxPriceDecimals(szDecimals: number, kind: 'perp' | 'spot' = 'perp'): number {
  return Math.max(0, (kind === 'spot' ? SPOT_MAX_DECIMALS : PERP_MAX_DECIMALS) - szDecimals);
}

/** Drop trailing zeros (and a dangling dot): "1.2300" → "1.23", "5.0" → "5". */
export function stripTrailingZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

export function formatSize(size: string | number, szDecimals: number): string {
  return stripTrailingZeros(Number(size).toFixed(szDecimals));
}

export function formatPrice(price: string | number, szDecimals: number, kind: 'perp' | 'spot' = 'perp'): string {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid price: ${price}`);
  }
  const maxDecimals = maxPriceDecimals(szDecimals, kind);
  // Clamp decimals, then enforce 5 significant figures (integers stay exact).
  const clamped = Number(n.toFixed(maxDecimals));
  const sigFig = Number(clamped.toPrecision(MAX_SIG_FIGS));
  // Re-clamp decimals after toPrecision (which can reintroduce extra places).
  return stripTrailingZeros(sigFig.toFixed(maxDecimals));
}

/** Normalized TIF → HL tif. */
export function mapTif(tif: TimeInForce | undefined): 'Gtc' | 'Ioc' | 'Alo' {
  switch (tif) {
    case 'IOC':
    case 'FOK':
      return 'Ioc';
    case 'POST_ONLY':
      return 'Alo';
    case 'GTC':
    default:
      return 'Gtc';
  }
}

/** HL order `t` field: limit vs trigger, derived from the normalized order type. */
export type HlOrderType =
  | { limit: { tif: 'Gtc' | 'Ioc' | 'Alo' | 'FrontendMarket' } }
  | { trigger: { isMarket: boolean; triggerPx: string; tpsl: 'tp' | 'sl' } };

export function buildOrderTypeField(params: OrderParams, szDecimals: number, kind: 'perp' | 'spot' = 'perp'): HlOrderType {
  switch (params.type) {
    case 'MARKET':
      // Spot uses a plain IOC at the slippage-cap price (FrontendMarket can fail to
      // cross on spot books → "could not immediately match"); perps keep FrontendMarket.
      return { limit: { tif: kind === 'spot' ? 'Ioc' : 'FrontendMarket' } };
    case 'LIMIT':
      return { limit: { tif: mapTif(params.timeInForce) } };
    case 'STOP_MARKET':
    case 'STOP_LIMIT':
    case 'TAKE_PROFIT_MARKET':
    case 'TAKE_PROFIT_LIMIT': {
      if (params.triggerPrice == null) {
        throw new Error(`${params.type} requires triggerPrice`);
      }
      const isMarket = params.type === 'STOP_MARKET' || params.type === 'TAKE_PROFIT_MARKET';
      const tpsl = params.type.startsWith('TAKE_PROFIT') ? 'tp' : 'sl';
      return {
        trigger: { isMarket, triggerPx: formatPrice(params.triggerPrice, szDecimals, kind), tpsl },
      };
    }
  }
}

/** The HL order request object (the element of action.orders[]). */
export interface HlOrderRequest {
  a: number; // asset index
  b: boolean; // isBuy
  p: string; // price
  s: string; // size
  r: boolean; // reduceOnly
  t: HlOrderType;
}

/**
 * Map a normalized OrderParams + resolved asset info into an HL order request.
 * `price` is required (for MARKET it is the slippage cap / worst price).
 */
export function buildOrderRequest(
  params: OrderParams,
  assetIndex: number,
  szDecimals: number,
  kind: 'perp' | 'spot' = 'perp'
): HlOrderRequest {
  if (params.price == null) {
    throw new Error(`HyperLiquid order requires a price (MARKET: pass a slippage-cap price)`);
  }
  return {
    a: assetIndex,
    b: params.side === 'BUY',
    p: formatPrice(params.price, szDecimals, kind),
    s: formatSize(params.amount, szDecimals),
    r: params.reduceOnly ?? false,
    t: buildOrderTypeField(params, szDecimals, kind),
  };
}
