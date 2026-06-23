/**
 * HyperliquidStream — normalized realtime over HL's WebSocket (ADR-001).
 *
 * Browser → exchange directly (no backend hop). Built on HyperliquidWsConnection
 * (reconnect + ref-counted subs). Channels used:
 *   - subscribeOrderbook → `l2Book`   (WsBook, same shape as the REST l2Book)
 *   - subscribePrices    → `allMids`  (mid prices; see note below)
 *   - subscribeAccount   → `clearinghouseState` + `openOrders` + `userFills`
 *
 * Note: `allMids` carries only mid prices, so streamed Price has mark=last=mid
 * and the rest ('0'); full context (funding/volume/oracle) comes from the read
 * adapter. Account reads/streams use the user's REAL lowercased address (ADR-003).
 */
import type {
  Account,
  AccountEvent,
  ExchangeStream,
  Order,
  Orderbook,
  Position,
  Price,
  RecentTrade,
  TradeHistoryItem,
  Unsubscribe,
} from 'exchange-core';
import { MAINNET, type HlEndpoint } from './info-client';
import { mapFill, mapOpenOrder, mapOrderbook, mapPosition, mapRecentTrade } from './mappers';
import type { HlBbo, HlL2Book, HlOpenOrder, HlPosition, HlRecentTrade, HlUserFill } from './raw-types';

/** Normalized best bid/offer update (`[px, sz]` per side; null if empty). */
export interface BboUpdate {
  bid: [string, string] | null;
  ask: [string, string] | null;
  time: number;
}
import { toHlCoin, toNormalizedSymbol } from './symbols';
import { HyperliquidWsConnection, type WsFactory } from './ws-connection';

function wsUrlFor(endpoint: HlEndpoint): string {
  return `${endpoint.apiUrl.replace(/^http/, 'ws')}/ws`;
}

/** allMids gives only a mid; fill the rest with '0' (read adapter has full ctx). */
function midToPrice(coin: string, mid: string, now: number): Price {
  return {
    symbol: toNormalizedSymbol(coin),
    mark: mid,
    index: mid,
    last: mid,
    bid: '0',
    ask: '0',
    funding: '0',
    volume24h: '0',
    change24h: '0',
    timestamp: now,
  };
}

/** WS clearinghouse fields can be numbers; coerce to the string shape mappers expect. */
function coercePosition(p: Record<string, unknown>): HlPosition {
  const lev = (p.leverage ?? {}) as { type?: string; value?: number; rawUsd?: unknown };
  const cf = p.cumFunding as { sinceOpen?: unknown } | undefined;
  return {
    coin: String(p.coin),
    szi: String(p.szi),
    entryPx: p.entryPx == null ? null : String(p.entryPx),
    positionValue: String(p.positionValue ?? '0'),
    unrealizedPnl: String(p.unrealizedPnl ?? '0'),
    liquidationPx: p.liquidationPx == null ? null : String(p.liquidationPx),
    marginUsed: String(p.marginUsed ?? '0'),
    leverage: { type: (lev.type as 'cross' | 'isolated') ?? 'cross', value: Number(lev.value ?? 1) },
    maxLeverage: p.maxLeverage == null ? undefined : Number(p.maxLeverage),
    returnOnEquity: p.returnOnEquity == null ? undefined : String(p.returnOnEquity),
    cumFunding: cf ? { allTime: '0', sinceChange: '0', sinceOpen: String(cf.sinceOpen ?? '0') } : undefined,
  };
}

interface WsInnerClearinghouse {
  assetPositions: Array<{ position: Record<string, unknown> }>;
  marginSummary: Record<string, unknown>;
  withdrawable: unknown;
  crossMaintenanceMarginUsed?: unknown;
}

function wsAccount(user: string, inner: WsInnerClearinghouse): Account {
  const ms = inner.marginSummary ?? {};
  const unrealizedPnl = (inner.assetPositions ?? []).reduce(
    (sum, ap) => sum + Number(ap.position.unrealizedPnl ?? 0),
    0
  );
  return {
    accountId: user,
    balance: String(ms.totalRawUsd ?? '0'),
    accountEquity: String(ms.accountValue ?? '0'),
    availableToSpend: String(inner.withdrawable ?? '0'),
    marginUsed: String(ms.totalMarginUsed ?? '0'),
    unrealizedPnl: String(unrealizedPnl),
    makerFee: '0',
    takerFee: '0',
    metadata: {
      totalNtlPos: String(ms.totalNtlPos ?? '0'),
      crossMaintenanceMarginUsed: String(inner.crossMaintenanceMarginUsed ?? '0'),
    },
  };
}

function wsPositions(inner: WsInnerClearinghouse): Position[] {
  return (inner.assetPositions ?? []).map((ap) => mapPosition(coercePosition(ap.position)));
}

export interface HyperliquidStreamOptions {
  endpoint?: HlEndpoint;
  wsFactory?: WsFactory;
  now?: () => number;
}

export class HyperliquidStream implements ExchangeStream {
  readonly name = 'hyperliquid' as const;

  private readonly conn: HyperliquidWsConnection;
  private readonly now: () => number;

  constructor(opts: HyperliquidStreamOptions = {}) {
    this.conn = new HyperliquidWsConnection(wsUrlFor(opts.endpoint ?? MAINNET), opts.wsFactory);
    this.now = opts.now ?? (() => Date.now());
  }

  subscribeOrderbook(symbol: string, cb: (book: Orderbook) => void): Unsubscribe {
    return this.conn.subscribe({ type: 'l2Book', coin: toHlCoin(symbol) }, (data) =>
      cb(mapOrderbook(data as HlL2Book))
    );
  }

  /**
   * Best bid/offer feed (HL `bbo` channel) — pushed only when the BBO changes on
   * a block, so it's far lower-latency than the rate-limited l2Book snapshot. Use
   * it to keep the top of the book moving in realtime. Not part of ExchangeStream
   * (HL-specific); call it on the concrete HyperliquidStream.
   */
  subscribeBbo(symbol: string, cb: (bbo: BboUpdate) => void): Unsubscribe {
    return this.conn.subscribe({ type: 'bbo', coin: toHlCoin(symbol) }, (data) => {
      const d = data as HlBbo;
      const [bid, ask] = d.bbo ?? [null, null];
      cb({
        bid: bid ? [bid.px, bid.sz] : null,
        ask: ask ? [ask.px, ask.sz] : null,
        time: d.time ?? 0,
      });
    });
  }

  subscribeTrades(symbol: string, cb: (trades: RecentTrade[]) => void): Unsubscribe {
    return this.conn.subscribe({ type: 'trades', coin: toHlCoin(symbol) }, (data) => {
      const raw = (Array.isArray(data) ? data : []) as HlRecentTrade[];
      if (raw.length) cb(raw.map(mapRecentTrade));
    });
  }

  /**
   * HL `candle` feed for one coin+interval. Pushes the forming candle (updates as
   * it builds, then a fresh one when it closes) — use it to keep the chart's last
   * bar live. `time` is epoch SECONDS (lightweight-charts shape). Not part of
   * ExchangeStream (HL-specific); call it on the concrete HyperliquidStream.
   */
  subscribeCandle(
    symbol: string,
    interval: string,
    cb: (c: { time: number; open: number; high: number; low: number; close: number; volume: number }) => void,
  ): Unsubscribe {
    return this.conn.subscribe({ type: 'candle', coin: toHlCoin(symbol), interval }, (data) => {
      const d = data as { t?: number; o?: string; h?: string; l?: string; c?: string; v?: string };
      if (d.t == null) return;
      cb({ time: Math.floor(d.t / 1000), open: Number(d.o), high: Number(d.h), low: Number(d.l), close: Number(d.c), volume: Number(d.v ?? 0) });
    });
  }

  subscribePrices(cb: (prices: Price[]) => void): Unsubscribe {
    return this.conn.subscribe({ type: 'allMids' }, (data) => {
      const mids = (data as { mids?: Record<string, string> }).mids ?? {};
      const now = this.now();
      cb(Object.entries(mids).map(([coin, mid]) => midToPrice(coin, mid, now)));
    });
  }

  subscribeAccount(accountId: string, cb: (event: AccountEvent) => void): Unsubscribe {
    const user = accountId.toLowerCase();
    const unsubs: Unsubscribe[] = [
      this.conn.subscribe({ type: 'clearinghouseState', user }, (data) => {
        const inner = ((data as { clearinghouseState?: WsInnerClearinghouse }).clearinghouseState ??
          data) as WsInnerClearinghouse;
        cb({ kind: 'account', account: wsAccount(user, inner) });
        cb({ kind: 'positions', positions: wsPositions(inner) });
      }),
      this.conn.subscribe({ type: 'openOrders', user }, (data) => {
        const orders = ((data as { orders?: HlOpenOrder[] }).orders ?? []) as HlOpenOrder[];
        cb({ kind: 'orders', orders: orders.map(mapOpenOrder) as Order[] });
      }),
      this.conn.subscribe({ type: 'userFills', user }, (data) => {
        const fills = ((data as { fills?: HlUserFill[] }).fills ?? []) as HlUserFill[];
        for (const f of fills) cb({ kind: 'fill', fill: mapFill(f) as TradeHistoryItem });
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }
}
