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

/** `bbo` → best bid/offer, pushed only when the BBO changes on a block.
 * `bbo: [bestBid | null, bestAsk | null]`. */
export interface HlBbo {
  coin: string;
  time: number;
  bbo: [HlBookLevel | null, HlBookLevel | null];
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
  // Present on `frontendOpenOrders` and the `openOrders` WS feed — trigger (TP/SL)
  // orders carry these so we can render type/condition and derive position TP/SL.
  orderType?: string;
  isTrigger?: boolean;
  triggerPx?: string;
  triggerCondition?: string;
  isPositionTpsl?: boolean;
}

// ── Spot ────────────────────────────────────────────────────────────────────
// hyperliquid.gitbook.io/.../api/info-endpoint/spot

/** A spot TOKEN (PURR, HYPE, USDC…). `index` is its position in `spotMeta.tokens`. */
export interface HlSpotToken {
  name: string;
  szDecimals: number;
  weiDecimals: number;
  index: number;
  tokenId: string;
  isCanonical?: boolean;
  evmContract?: unknown;
  fullName?: string | null;
}

/** A spot PAIR (e.g. PURR/USDC). `tokens` = [baseTokenIndex, quoteTokenIndex];
 * `index` is the pair's position in `spotMeta.universe`. The order/stream coin for
 * this pair is `"@{index}"`, and the signing asset id is `10000 + index`. */
export interface HlSpotUniverseAsset {
  name: string;
  tokens: [number, number];
  index: number;
  isCanonical?: boolean;
}

export interface HlSpotMeta {
  tokens: HlSpotToken[];
  universe: HlSpotUniverseAsset[];
}

/** Per-pair context, index-aligned with `spotMeta.universe`. */
export interface HlSpotAssetCtx {
  dayNtlVlm: string;
  markPx: string;
  midPx: string | null;
  prevDayPx: string;
  circulatingSupply?: string;
  coin?: string;
  dayBaseVlm?: string;
}

/** `spotMetaAndAssetCtxs` → [spotMeta, ctxs] (ctxs index-aligned with universe). */
export type HlSpotMetaAndAssetCtxs = [HlSpotMeta, HlSpotAssetCtx[]];

/** A spot balance row from `spotClearinghouseState`. `total` includes `hold`
 * (amount locked in resting orders); free = total - hold. */
export interface HlSpotBalance {
  coin: string;
  token: number;
  total: string;
  hold: string;
  entryNtl?: string;
}

export interface HlSpotClearinghouseState {
  balances: HlSpotBalance[];
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
