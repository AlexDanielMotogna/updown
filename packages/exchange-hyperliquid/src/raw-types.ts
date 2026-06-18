/**
 * Raw HyperLiquid `info` endpoint response shapes (the subset the read adapter
 * consumes). These mirror the docs at
 * hyperliquid.gitbook.io/.../api/info-endpoint and /info-endpoint/perpetuals.
 * They are intentionally permissive (optional fields) — HL adds fields over time
 * and HIP-3 dexs carry extra ones we tuck into `metadata`.
 */

export interface HlUniverseAsset {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
  isDelisted?: boolean;
  marginMode?: string;
  marginTableId?: number;
}

export interface HlMeta {
  universe: HlUniverseAsset[];
  marginTables?: unknown;
  collateralToken?: number;
}

/** Per-asset context, index-aligned with `meta.universe`. */
export interface HlAssetCtx {
  dayNtlVlm: string;
  funding: string;
  impactPxs: [string, string] | null;
  markPx: string;
  midPx: string | null;
  openInterest: string;
  oraclePx: string;
  premium: string | null;
  prevDayPx: string;
  dayBaseVlm?: string;
}

/** `metaAndAssetCtxs` → [meta, ctxs] (ctxs index-aligned with meta.universe). */
export type HlMetaAndAssetCtxs = [HlMeta, HlAssetCtx[]];

/** `allMids` → { mids: { BTC: "…", ETH: "…" } }. */
export interface HlAllMids {
  mids: Record<string, string>;
}

export interface HlBookLevel {
  px: string;
  sz: string;
  n: number;
}

/** `l2Book` → { coin, time, levels: [bids, asks] }. */
export interface HlL2Book {
  coin: string;
  time: number;
  levels: [HlBookLevel[], HlBookLevel[]];
}

/** `candleSnapshot` element. */
export interface HlCandle {
  t: number; // open time (ms)
  T: number; // close time (ms)
  s: string; // coin
  i: string; // interval
  o: string;
  c: string;
  h: string;
  l: string;
  v: string; // base volume
  n: number; // trade count
}

export interface HlLeverage {
  type: 'cross' | 'isolated';
  value: number;
  rawUsd?: string;
}

export interface HlPosition {
  coin: string;
  szi: string; // signed: + long, - short
  entryPx: string | null;
  positionValue: string;
  unrealizedPnl: string;
  liquidationPx: string | null;
  marginUsed: string;
  leverage: HlLeverage;
  maxLeverage?: number;
  returnOnEquity?: string;
  cumFunding?: { allTime: string; sinceChange: string; sinceOpen: string };
}

export interface HlAssetPosition {
  position: HlPosition;
  type: string; // "oneWay"
}

export interface HlMarginSummary {
  accountValue: string;
  totalMarginUsed: string;
  totalNtlPos: string;
  totalRawUsd: string;
}

/** `clearinghouseState` → account summary + positions. */
export interface HlClearinghouseState {
  assetPositions: HlAssetPosition[];
  marginSummary: HlMarginSummary;
  crossMarginSummary: HlMarginSummary;
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
  time: number;
}

/** `openOrders` element. side: "B" (bid/buy) | "A" (ask/sell). */
export interface HlOpenOrder {
  coin: string;
  oid: number;
  side: 'B' | 'A';
  limitPx: string;
  sz: string;
  origSz?: string;
  timestamp: number;
  cloid?: string;
  reduceOnly?: boolean;
}

/** `recentTrades` element. side: "B" (buy) | "A" (sell). */
export interface HlRecentTrade {
  coin: string;
  side: 'B' | 'A';
  px: string;
  sz: string;
  time: number;
  tid: number;
  hash?: string;
}

/** `userFills` element. */
export interface HlUserFill {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A';
  time: number;
  fee: string;
  closedPnl: string;
  oid: number;
  tid: number;
  hash?: string;
  dir?: string;
}
