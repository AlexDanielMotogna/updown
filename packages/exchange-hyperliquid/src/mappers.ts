/**
 * Pure mappers: raw HyperLiquid shapes → exchange-core normalized types.
 * No I/O. Numeric fields stay strings (precision); timestamps are epoch ms.
 * Anything HL provides that doesn't fit goes into `metadata`.
 */
import type {
  Account,
  Balance,
  Candle,
  Market,
  Order,
  Orderbook,
  Position,
  Price,
  RecentTrade,
  TradeHistoryItem,
} from 'exchange-core';
import { toNormalizedSymbol } from './symbols';
import type {
  HlAssetCtx,
  HlCandle,
  HlClearinghouseState,
  HlL2Book,
  HlOpenOrder,
  HlPosition,
  HlRecentTrade,
  HlUniverseAsset,
  HlUserFill,
  HlSpotMeta,
  HlSpotAssetCtx,
  HlSpotClearinghouseState,
} from './raw-types';

/** Perp price precision: at most (PERP_MAX_DECIMALS - szDecimals) decimals. */
const PERP_MAX_DECIMALS = 6;
/** Spot price precision: at most (SPOT_MAX_DECIMALS - szDecimals) decimals. */
const SPOT_MAX_DECIMALS = 8;

/** 10^-n as a plain decimal string: 0 → "1", 5 → "0.00001". */
function pow10Neg(n: number): string {
  if (n <= 0) return '1';
  return `0.${'0'.repeat(n - 1)}1`;
}

function safeDiv(a: string, b: string): string {
  const nb = Number(b);
  if (!nb) return '0';
  return String(Number(a) / nb);
}

function pctChange(curr: string, prev: string): string {
  const np = Number(prev);
  if (!np) return '0';
  return String(((Number(curr) - np) / np) * 100);
}

function sideFromSzi(szi: string): 'LONG' | 'SHORT' {
  return szi.trim().startsWith('-') ? 'SHORT' : 'LONG';
}

function absStr(n: string): string {
  return n.startsWith('-') ? n.slice(1) : n;
}

// --- Markets / prices ------------------------------------------------------

export function mapMarket(asset: HlUniverseAsset, ctx: HlAssetCtx | undefined): Market {
  const priceDecimals = Math.max(0, PERP_MAX_DECIMALS - asset.szDecimals);
  return {
    symbol: toNormalizedSymbol(asset.name),
    baseAsset: asset.name,
    quoteAsset: 'USD',
    tickSize: pow10Neg(priceDecimals),
    stepSize: pow10Neg(asset.szDecimals),
    minOrderSize: '0',
    maxOrderSize: '0',
    minNotional: '10', // HL enforces a $10 minimum order value
    maxLeverage: asset.maxLeverage,
    fundingRate: ctx?.funding ?? '0',
    fundingInterval: 1, // HL funding accrues hourly
    metadata: {
      szDecimals: asset.szDecimals,
      onlyIsolated: asset.onlyIsolated ?? false,
      isDelisted: asset.isDelisted ?? false,
      marginMode: asset.marginMode,
      openInterest: ctx?.openInterest,
    },
  };
}

export function mapMarkets(universe: HlUniverseAsset[], ctxs: HlAssetCtx[]): Market[] {
  return universe.map((asset, i) => mapMarket(asset, ctxs[i]));
}

export function mapPrice(asset: HlUniverseAsset, ctx: HlAssetCtx, now: number): Price {
  return {
    symbol: toNormalizedSymbol(asset.name),
    mark: ctx.markPx,
    index: ctx.oraclePx,
    last: ctx.midPx ?? ctx.markPx,
    bid: ctx.impactPxs?.[0] ?? '0',
    ask: ctx.impactPxs?.[1] ?? '0',
    funding: ctx.funding,
    volume24h: ctx.dayNtlVlm,
    change24h: pctChange(ctx.markPx, ctx.prevDayPx),
    timestamp: now,
  };
}

export function mapPrices(universe: HlUniverseAsset[], ctxs: HlAssetCtx[], now: number): Price[] {
  return universe.map((asset, i) => mapPrice(asset, ctxs[i], now)).filter((p) => p.mark != null);
}

// --- Spot markets / prices / balances --------------------------------------
// Spot order/stream coin is "@{pairIndex}"; signing asset id is 10000+pairIndex.
// The readable symbol is "BASE/QUOTE" (e.g. "HYPE/USDC") to avoid colliding with
// the perp "BASE-USD" symbols. hlCoin + spotIndex live in metadata for the signer
// and the stream layer.

/** Display symbol for a spot pair, e.g. "HYPE/USDC". */
export function spotPairSymbol(base: string, quote: string): string {
  return `${base}/${quote}`;
}

/** The HL coin/allMids key for a spot pair: the pair name for canonical pairs
 * (e.g. "PURR/USDC"), else "@{arrayPosition}". NOTE: this is the ARRAY POSITION in
 * spotMeta.universe, NOT the pair's `.index` field — HL keys allMids/orderbook and
 * the order asset id (10000 + arrayPosition) by array position; `.index` is a
 * different token-pair id that does NOT match allMids. */
export function spotCoin(pair: { name: string; isCanonical?: boolean }, arrayPos: number): string {
  return pair.isCanonical ? pair.name : `@${arrayPos}`;
}

export function mapSpotMarkets(meta: HlSpotMeta, ctxs: HlSpotAssetCtx[]): Market[] {
  return meta.universe.map((pair, i) => {
    const base = meta.tokens[pair.tokens[0]];
    const quote = meta.tokens[pair.tokens[1]];
    const szDecimals = base?.szDecimals ?? 0;
    const priceDecimals = Math.max(0, SPOT_MAX_DECIMALS - szDecimals);
    const ctx = ctxs[i];
    const coin = spotCoin(pair, i);
    return {
      // symbol = the HL coin (unique, matches allMids + the order). Display uses
      // metadata.displayName ("BASE/QUOTE"). Keying by name collides (HL has dup
      // token names) and mismatches the asset id — that caused wrong price/size.
      symbol: coin,
      baseAsset: base?.name ?? pair.name,
      quoteAsset: quote?.name ?? 'USDC',
      tickSize: pow10Neg(priceDecimals),
      stepSize: pow10Neg(szDecimals),
      minOrderSize: '0',
      maxOrderSize: '0',
      minNotional: '10',
      maxLeverage: 0,
      fundingRate: '0',
      fundingInterval: 0,
      kind: 'spot',
      metadata: {
        hlCoin: coin,
        spotIndex: i,
        assetId: 10000 + i,
        displayName: spotPairSymbol(base?.name ?? pair.name, quote?.name ?? 'USDC'),
        szDecimals,
        baseTokenIndex: pair.tokens[0],
        quoteTokenIndex: pair.tokens[1],
        markPx: ctx?.markPx,
        midPx: ctx?.midPx,
        prevDayPx: ctx?.prevDayPx,
        dayNtlVlm: ctx?.dayNtlVlm,
        isCanonical: pair.isCanonical ?? false,
      },
    };
  });
}

export function mapSpotPrices(meta: HlSpotMeta, ctxs: HlSpotAssetCtx[], now: number): Price[] {
  return meta.universe
    .map((pair, i) => {
      const ctx = ctxs[i];
      if (!ctx) return null;
      return {
        symbol: spotCoin(pair, i),
        mark: ctx.markPx,
        index: ctx.markPx,
        last: ctx.midPx ?? ctx.markPx,
        bid: '0',
        ask: '0',
        funding: '0',
        volume24h: ctx.dayNtlVlm,
        change24h: pctChange(ctx.markPx, ctx.prevDayPx),
        timestamp: now,
      } as Price;
    })
    .filter((p): p is Price => p != null && p.mark != null);
}

export function mapSpotBalances(state: HlSpotClearinghouseState, meta?: HlSpotMeta, ctxs?: HlSpotAssetCtx[]): Balance[] {
  // Price each balance by its TOKEN INDEX (not name — names collide). Build a map
  // baseTokenIndex -> markPx from the pair whose base token is that index.
  const priceByToken = new Map<number, string>();
  if (meta && ctxs) {
    meta.universe.forEach((pair, i) => {
      const baseIdx = pair.tokens[0];
      if (!priceByToken.has(baseIdx) && ctxs[i]?.markPx) priceByToken.set(baseIdx, ctxs[i].markPx);
    });
  }
  return state.balances.map((b) => {
    const tok = meta?.tokens[b.token];
    // HL's "Contract" column shows the tokenId (not the evmContract address).
    const contract = tok?.tokenId;
    const price = b.coin === 'USDC' ? 1 : Number(priceByToken.get(b.token) ?? 0);
    const usdValue = price > 0 ? String(Number(b.total) * price) : undefined;
    return {
      asset: b.coin,
      total: b.total,
      available: String(Number(b.total) - Number(b.hold)),
      entryNotional: b.entryNtl,
      usdValue,
      metadata: { token: b.token, hold: b.hold, contract, price: String(price) },
    };
  });
}

// --- Orderbook / candles ---------------------------------------------------

export function mapOrderbook(book: HlL2Book): Orderbook {
  const [bids, asks] = book.levels;
  return {
    symbol: toNormalizedSymbol(book.coin),
    bids: bids.map((l) => [l.px, l.sz] as [string, string]),
    asks: asks.map((l) => [l.px, l.sz] as [string, string]),
    timestamp: book.time,
  };
}

export function mapCandle(c: HlCandle): Candle {
  return { timestamp: c.t, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v };
}

export function mapRecentTrade(t: HlRecentTrade): RecentTrade {
  return {
    id: String(t.tid),
    symbol: toNormalizedSymbol(t.coin),
    side: t.side === 'B' ? 'BUY' : 'SELL',
    price: t.px,
    amount: t.sz,
    timestamp: t.time,
  };
}

// --- Account / positions ---------------------------------------------------

export function mapPosition(p: HlPosition): Position {
  return {
    symbol: toNormalizedSymbol(p.coin),
    side: sideFromSzi(p.szi),
    amount: absStr(p.szi),
    entryPrice: p.entryPx ?? '0',
    markPrice: safeDiv(p.positionValue, absStr(p.szi)),
    margin: p.marginUsed,
    leverage: p.leverage.value,
    unrealizedPnl: p.unrealizedPnl,
    liquidationPrice: p.liquidationPx ?? '0',
    funding: p.cumFunding?.sinceOpen ?? '0',
    metadata: {
      leverageType: p.leverage.type,
      positionValue: p.positionValue,
      returnOnEquity: p.returnOnEquity,
      maxLeverage: p.maxLeverage,
    },
  };
}

export function mapPositions(state: HlClearinghouseState): Position[] {
  return state.assetPositions.map((ap) => mapPosition(ap.position));
}

export function mapAccount(accountId: string, state: HlClearinghouseState): Account {
  const unrealizedPnl = state.assetPositions.reduce(
    (sum, ap) => sum + Number(ap.position.unrealizedPnl || 0),
    0
  );
  return {
    accountId,
    balance: state.marginSummary.totalRawUsd,
    accountEquity: state.marginSummary.accountValue,
    availableToSpend: state.withdrawable,
    marginUsed: state.marginSummary.totalMarginUsed,
    unrealizedPnl: String(unrealizedPnl),
    makerFee: '0', // not in clearinghouseState; populate from userFees later
    takerFee: '0',
    metadata: {
      crossMaintenanceMarginUsed: state.crossMaintenanceMarginUsed,
      totalNtlPos: state.marginSummary.totalNtlPos,
      time: state.time,
    },
  };
}

// --- Orders / fills --------------------------------------------------------

export function mapOpenOrder(o: HlOpenOrder): Order {
  const amount = o.origSz ?? o.sz;
  const filled = String(Number(amount) - Number(o.sz));
  return {
    orderId: o.oid,
    clientOrderId: o.cloid,
    symbol: toNormalizedSymbol(o.coin),
    side: o.side === 'B' ? 'BUY' : 'SELL',
    type: 'LIMIT',
    price: o.limitPx,
    amount,
    filled,
    remaining: o.sz,
    status: Number(filled) > 0 ? 'PARTIALLY_FILLED' : 'OPEN',
    timeInForce: 'GTC',
    reduceOnly: o.reduceOnly ?? false,
    createdAt: o.timestamp,
    updatedAt: o.timestamp,
    // Carry trigger (TP/SL) fields through so the UI can render order type /
    // condition and derive position TP/SL from the realtime feed (the server REST
    // route `frontendOpenOrders` is unusable from datacenter IPs — HL returns []).
    metadata: {
      orderType: o.orderType,
      isTrigger: o.isTrigger ?? false,
      triggerPx: o.triggerPx,
      triggerCondition: o.triggerCondition,
      isPositionTpsl: o.isPositionTpsl ?? false,
    },
  };
}

export function mapFill(f: HlUserFill): TradeHistoryItem {
  return {
    historyId: String(f.tid),
    orderId: f.oid,
    symbol: toNormalizedSymbol(f.coin),
    side: f.side === 'B' ? 'BUY' : 'SELL',
    amount: f.sz,
    price: f.px,
    fee: f.fee,
    pnl: f.closedPnl ?? null,
    executedAt: f.time,
    metadata: { hash: f.hash, dir: f.dir },
  };
}
