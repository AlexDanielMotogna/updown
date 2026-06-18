import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from './info-client';
import { HyperliquidReadAdapter } from './read-adapter';

/** Build a fake fetch that routes by the `info` request `type`. */
function fakeFetch(routes: Record<string, unknown>): FetchLike {
  return vi.fn(async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as { type: string };
    const payload = routes[body.type];
    if (payload === undefined) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => payload };
  });
}

const META_AND_CTXS = [
  {
    universe: [
      { name: 'BTC', szDecimals: 5, maxLeverage: 50 },
      { name: 'HPOS', szDecimals: 0, maxLeverage: 3, onlyIsolated: true },
    ],
  },
  [
    {
      dayNtlVlm: '1000',
      funding: '0.0000125',
      impactPxs: ['63999.0', '64001.0'],
      markPx: '64000.0',
      midPx: '64000.5',
      openInterest: '688.11',
      oraclePx: '64010.0',
      premium: '0.0003',
      prevDayPx: '65000.0',
    },
    {
      dayNtlVlm: '5',
      funding: '0.0',
      impactPxs: null,
      markPx: '1.5',
      midPx: null,
      openInterest: '10',
      oraclePx: '1.51',
      premium: null,
      prevDayPx: '1.4',
    },
  ],
];

const CLEARINGHOUSE = {
  assetPositions: [
    {
      position: {
        coin: 'ETH',
        szi: '-0.5',
        entryPx: '3000.0',
        positionValue: '1550.0',
        unrealizedPnl: '-50.0',
        liquidationPx: '4000.0',
        marginUsed: '155.0',
        leverage: { type: 'isolated', value: 10 },
        cumFunding: { allTime: '5', sinceChange: '0', sinceOpen: '1.2' },
      },
      type: 'oneWay',
    },
  ],
  marginSummary: {
    accountValue: '13109.48',
    totalMarginUsed: '155.0',
    totalNtlPos: '1550.0',
    totalRawUsd: '13000.0',
  },
  crossMarginSummary: {
    accountValue: '13104.51',
    totalMarginUsed: '0.0',
    totalNtlPos: '0.0',
    totalRawUsd: '13104.51',
  },
  crossMaintenanceMarginUsed: '0.0',
  withdrawable: '12000.0',
  time: 1708622398623,
};

function adapter(routes: Record<string, unknown>): HyperliquidReadAdapter {
  return new HyperliquidReadAdapter({ fetchImpl: fakeFetch(routes), now: () => 1_700_000_000_000 });
}

describe('HyperliquidReadAdapter', () => {
  it('maps markets with derived tick/step and metadata', async () => {
    const markets = await adapter({ metaAndAssetCtxs: META_AND_CTXS }).getMarkets();
    expect(markets).toHaveLength(2);
    const btc = markets[0];
    expect(btc.symbol).toBe('BTC-USD');
    expect(btc.tickSize).toBe('0.1'); // 6 - 5 = 1 decimal
    expect(btc.stepSize).toBe('0.00001'); // szDecimals 5
    expect(btc.maxLeverage).toBe(50);
    expect(btc.fundingInterval).toBe(1);
    expect(btc.metadata.szDecimals).toBe(5);
    // szDecimals 0 → price decimals 6 → tick 0.000001; size step 1
    expect(markets[1].tickSize).toBe('0.000001');
    expect(markets[1].stepSize).toBe('1');
  });

  it('maps prices with % change and impact px bid/ask', async () => {
    const prices = await adapter({ metaAndAssetCtxs: META_AND_CTXS }).getPrices();
    const btc = prices[0];
    expect(btc.mark).toBe('64000.0');
    expect(btc.bid).toBe('63999.0');
    expect(btc.ask).toBe('64001.0');
    expect(Number(btc.change24h)).toBeCloseTo(((64000 - 65000) / 65000) * 100);
    expect(btc.timestamp).toBe(1_700_000_000_000);
    // null impactPxs / midPx fall back gracefully
    expect(prices[1].bid).toBe('0');
    expect(prices[1].last).toBe('1.5');
  });

  it('maps orderbook to [price,size] levels', async () => {
    const book = {
      coin: 'BTC',
      time: 123,
      levels: [
        [{ px: '64000.0', sz: '1.0', n: 1 }],
        [{ px: '64001.0', sz: '2.0', n: 1 }],
      ],
    };
    const ob = await adapter({ l2Book: book }).getOrderbook('BTC-USD');
    expect(ob.symbol).toBe('BTC-USD');
    expect(ob.bids).toEqual([['64000.0', '1.0']]);
    expect(ob.asks).toEqual([['64001.0', '2.0']]);
    expect(ob.timestamp).toBe(123);
  });

  it('maps a short position (negative szi → SHORT, abs amount, derived mark)', async () => {
    const positions = await adapter({ clearinghouseState: CLEARINGHOUSE }).getPositions('0xabc');
    expect(positions).toHaveLength(1);
    const p = positions[0];
    expect(p.symbol).toBe('ETH-USD');
    expect(p.side).toBe('SHORT');
    expect(p.amount).toBe('0.5');
    expect(p.leverage).toBe(10);
    expect(Number(p.markPrice)).toBeCloseTo(1550 / 0.5); // positionValue / |szi|
    expect(p.funding).toBe('1.2');
  });

  it('maps account, summing unrealized pnl from positions', async () => {
    const acct = await adapter({ clearinghouseState: CLEARINGHOUSE }).getAccount('0xABC');
    expect(acct.accountId).toBe('0xabc'); // lowercased
    expect(acct.accountEquity).toBe('13109.48');
    expect(acct.availableToSpend).toBe('12000.0');
    expect(acct.unrealizedPnl).toBe('-50');
  });

  it('lowercases the EVM address before querying (ADR-003)', async () => {
    const fetchImpl = fakeFetch({ clearinghouseState: CLEARINGHOUSE });
    const a = new HyperliquidReadAdapter({ fetchImpl });
    await a.getPositions('0xDEADBEEF');
    const sentBody = JSON.parse((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(sentBody.user).toBe('0xdeadbeef');
  });

  it('throws a clear error on non-ok HTTP', async () => {
    await expect(adapter({}).getMarkets()).rejects.toThrow(/metaAndAssetCtxs.*HTTP 404/);
  });
});
