import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HyperliquidStream } from './stream';
import { HyperliquidWsConnection, type WsLike } from './ws-connection';

/** Fake WebSocket: records sent frames, lets tests drive lifecycle/messages. */
class FakeSocket implements WsLike {
  onopen: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  sent: string[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.onclose?.();
  }
  open(): void {
    this.onopen?.();
  }
  emit(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  parsedSent(): Array<{ method: string; subscription: { type: string; coin?: string; user?: string } }> {
    return this.sent.map((s) => JSON.parse(s));
  }
}

let sockets: FakeSocket[];
const factory = (_url: string) => {
  const s = new FakeSocket();
  sockets.push(s);
  return s;
};

beforeEach(() => {
  sockets = [];
});

describe('HyperliquidWsConnection', () => {
  it('sends a subscribe frame after open and routes messages by feed', () => {
    const conn = new HyperliquidWsConnection('ws://x', factory);
    const seen: unknown[] = [];
    conn.subscribe({ type: 'l2Book', coin: 'BTC' }, (d) => seen.push(d));

    const sock = sockets[0];
    sock.open();
    expect(sock.parsedSent()).toEqual([
      { method: 'subscribe', subscription: { type: 'l2Book', coin: 'BTC' } },
    ]);

    sock.emit({ channel: 'l2Book', data: { coin: 'BTC', time: 1, levels: [[], []] } });
    sock.emit({ channel: 'l2Book', data: { coin: 'ETH', time: 1, levels: [[], []] } }); // other feed
    expect(seen).toHaveLength(1);
  });

  it('ref-counts: 2 handlers → 1 subscribe; unsubscribe only when last leaves', () => {
    const conn = new HyperliquidWsConnection('ws://x', factory);
    const u1 = conn.subscribe({ type: 'l2Book', coin: 'BTC' }, () => {});
    const u2 = conn.subscribe({ type: 'l2Book', coin: 'BTC' }, () => {});
    const sock = sockets[0];
    sock.open();

    expect(sock.parsedSent().filter((m) => m.method === 'subscribe')).toHaveLength(1);

    u1();
    expect(sock.parsedSent().filter((m) => m.method === 'unsubscribe')).toHaveLength(0);
    u2();
    expect(sock.parsedSent().filter((m) => m.method === 'unsubscribe')).toHaveLength(1);
  });

  it('re-subscribes everything after a reconnect', () => {
    vi.useFakeTimers();
    const conn = new HyperliquidWsConnection('ws://x', factory);
    conn.subscribe({ type: 'l2Book', coin: 'BTC' }, () => {});
    const first = sockets[0];
    first.open();
    expect(first.parsedSent().filter((m) => m.method === 'subscribe')).toHaveLength(1);

    first.close(); // drop → schedule reconnect
    vi.runOnlyPendingTimers(); // fire reconnect timer → new socket
    expect(sockets).toHaveLength(2);
    sockets[1].open();
    expect(sockets[1].parsedSent()).toEqual([
      { method: 'subscribe', subscription: { type: 'l2Book', coin: 'BTC' } },
    ]);
    vi.useRealTimers();
  });
});

describe('HyperliquidStream', () => {
  it('maps l2Book → normalized Orderbook', () => {
    const stream = new HyperliquidStream({ wsFactory: factory, now: () => 999 });
    const books: unknown[] = [];
    stream.subscribeOrderbook('BTC-USD', (b) => books.push(b));
    const sock = sockets[0];
    sock.open();
    sock.emit({
      channel: 'l2Book',
      data: { coin: 'BTC', time: 5, levels: [[{ px: '100', sz: '1', n: 1 }], [{ px: '101', sz: '2', n: 1 }]] },
    });
    expect(books[0]).toEqual({
      symbol: 'BTC-USD',
      bids: [['100', '1']],
      asks: [['101', '2']],
      timestamp: 5,
    });
  });

  it('maps allMids → Price[] (mid as mark/last)', () => {
    const stream = new HyperliquidStream({ wsFactory: factory, now: () => 999 });
    let prices: Array<{ symbol: string; mark: string }> = [];
    stream.subscribePrices((p) => (prices = p));
    sockets[0].open();
    sockets[0].emit({ channel: 'allMids', data: { mids: { BTC: '64000', ETH: '3000' } } });
    expect(prices).toHaveLength(2);
    const btc = prices.find((p) => p.symbol === 'BTC-USD');
    expect(btc?.mark).toBe('64000');
  });

  it('maps trades (array data) → RecentTrade[] and routes by coin', () => {
    const stream = new HyperliquidStream({ wsFactory: factory });
    const batches: Array<Array<{ symbol: string; side: string; price: string }>> = [];
    stream.subscribeTrades('BTC-USD', (t) => batches.push(t));
    const sock = sockets[0];
    sock.open();
    expect(sock.parsedSent()).toEqual([{ method: 'subscribe', subscription: { type: 'trades', coin: 'BTC' } }]);

    sock.emit({
      channel: 'trades',
      data: [
        { coin: 'BTC', side: 'B', px: '64000', sz: '0.5', time: 1, tid: 11 },
        { coin: 'BTC', side: 'A', px: '63990', sz: '0.2', time: 2, tid: 12 },
      ],
    });
    sock.emit({ channel: 'trades', data: [{ coin: 'ETH', side: 'B', px: '3000', sz: '1', time: 3, tid: 13 }] }); // other feed

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][0]).toMatchObject({ symbol: 'BTC-USD', side: 'BUY', price: '64000' });
    expect(batches[0][1].side).toBe('SELL');
  });

  it('subscribeAccount emits account + positions from clearinghouseState', () => {
    const stream = new HyperliquidStream({ wsFactory: factory });
    const events: Array<{ kind: string }> = [];
    stream.subscribeAccount('0xABC', (e) => events.push(e));
    const sock = sockets[0];
    sock.open();
    // three subs: clearinghouseState, openOrders, userFills
    expect(sock.parsedSent().map((m) => m.subscription.type).sort()).toEqual([
      'clearinghouseState',
      'openOrders',
      'userFills',
    ]);

    sock.emit({
      channel: 'clearinghouseState',
      data: {
        user: '0xabc',
        clearinghouseState: {
          assetPositions: [
            {
              position: {
                coin: 'ETH',
                szi: -0.5,
                entryPx: 3000,
                positionValue: 1550,
                unrealizedPnl: -50,
                liquidationPx: 4000,
                marginUsed: 155,
                leverage: { type: 'isolated', value: 10 },
              },
            },
          ],
          marginSummary: { accountValue: 13109.48, totalRawUsd: 13000, totalMarginUsed: 155, totalNtlPos: 1550 },
          withdrawable: 12000,
        },
      },
    });

    const acct = events.find((e) => e.kind === 'account') as { account: { unrealizedPnl: string } };
    const pos = events.find((e) => e.kind === 'positions') as { positions: Array<{ side: string; amount: string }> };
    expect(acct.account.unrealizedPnl).toBe('-50');
    expect(pos.positions[0].side).toBe('SHORT');
    expect(pos.positions[0].amount).toBe('0.5');
  });
});
