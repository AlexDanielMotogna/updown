import { describe, expect, it } from 'vitest';
import { InfoClient, type FetchLike } from './info-client';
import { HyperliquidSigner } from './signer';

const TEST_KEY = `0x${'1'.repeat(64)}` as `0x${string}`;

const META = { universe: [
  { name: 'BTC', szDecimals: 5, maxLeverage: 50 },
  { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
] };

/** InfoClient backed by a fake fetch that serves `meta`. */
function fakeInfo(): InfoClient {
  const fetchImpl: FetchLike = async () => ({ ok: true, status: 200, json: async () => META });
  return new InfoClient({ apiUrl: 'https://api.hyperliquid-testnet.xyz' }, fetchImpl);
}

interface Captured {
  action: { type: string; [k: string]: unknown };
}

/** Fake SDK transport: captures the signed payload, returns a canned ok response. */
function fakeTransport(captured: Captured[]) {
  return {
    isTestnet: true,
    async request(_endpoint: string, payload: unknown): Promise<unknown> {
      const p = payload as { action: { type: string } };
      captured.push({ action: p.action });
      switch (p.action.type) {
        case 'order':
          return { status: 'ok', response: { type: 'order', data: { statuses: [{ resting: { oid: 123 } }] } } };
        case 'cancel':
          return { status: 'ok', response: { type: 'cancel', data: { statuses: ['success'] } } };
        default:
          return { status: 'ok', response: { type: 'default' } };
      }
    },
  };
}

function makeSigner(captured: Captured[]): HyperliquidSigner {
  return new HyperliquidSigner({
    privateKey: TEST_KEY,
    endpoint: { apiUrl: 'https://api.hyperliquid-testnet.xyz' },
    infoClient: fakeInfo(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: fakeTransport(captured) as any,
  });
}

describe('HyperliquidSigner', () => {
  it('throws when constructed without an account', async () => {
    const signer = new HyperliquidSigner({ infoClient: fakeInfo() });
    await expect(
      signer.signAndSubmit(signer.buildOrder({ symbol: 'BTC-USD', side: 'BUY', type: 'LIMIT', amount: '0.001', price: '64000' }))
    ).rejects.toThrow(/no account/);
  });

  it('signs and submits a limit order with the correct action payload', async () => {
    const captured: Captured[] = [];
    const signer = makeSigner(captured);
    const payload = signer.buildOrder({
      symbol: 'BTC-USD', side: 'BUY', type: 'LIMIT', amount: '0.001', price: '64000', timeInForce: 'GTC',
    });
    const res = await signer.signAndSubmit(payload);

    expect(captured).toHaveLength(1);
    const action = captured[0].action as { type: string; orders: unknown[]; grouping: string };
    expect(action.type).toBe('order');
    expect(action.grouping).toBe('na');
    expect(action.orders[0]).toEqual({
      a: 0, b: true, p: '64000', s: '0.001', r: false, t: { limit: { tif: 'Gtc' } },
    });
    expect(res).toEqual({ orderId: 123, status: 'OPEN', metadata: { resting: { oid: 123 } } });
  });

  it('stop-limit: trigger order keeps its limit price + triggerPx (sl, not market)', async () => {
    const captured: Captured[] = [];
    await makeSigner(captured).signAndSubmit(
      makeSigner(captured).buildOrder({
        symbol: 'BTC-USD', side: 'SELL', type: 'STOP_LIMIT', amount: '0.01', price: '60000', triggerPrice: '61000',
      })
    );
    const action = captured.at(-1)!.action as { orders: Array<{ p: string; t: unknown }> };
    expect(action.orders[0].p).toBe('60000');
    expect(action.orders[0].t).toEqual({ trigger: { isMarket: false, triggerPx: '61000', tpsl: 'sl' } });
  });

  it('stop-market: derives a slippage-cap price off the trigger (was missing → threw)', async () => {
    const captured: Captured[] = [];
    await makeSigner(captured).signAndSubmit(
      makeSigner(captured).buildOrder({
        symbol: 'BTC-USD', side: 'SELL', type: 'STOP_MARKET', amount: '0.01', triggerPrice: '60000',
      })
    );
    const action = captured.at(-1)!.action as { orders: Array<{ p: string; t: unknown }> };
    // SELL crosses down: 60000 * 0.95 = 57000
    expect(action.orders[0].p).toBe('57000');
    expect(action.orders[0].t).toEqual({ trigger: { isMarket: true, triggerPx: '60000', tpsl: 'sl' } });
  });

  it('honors maxSlippagePct when deriving the cap (stop-market)', async () => {
    const captured: Captured[] = [];
    await makeSigner(captured).signAndSubmit(
      makeSigner(captured).buildOrder({
        symbol: 'BTC-USD', side: 'SELL', type: 'STOP_MARKET', amount: '0.01', triggerPrice: '60000', maxSlippagePct: 10,
      })
    );
    const action = captured.at(-1)!.action as { orders: Array<{ p: string }> };
    // SELL, 10% slippage: 60000 * 0.90 = 54000
    expect(action.orders[0].p).toBe('54000');
  });

  it('stop-market without a trigger price throws', async () => {
    const captured: Captured[] = [];
    await expect(
      makeSigner(captured).signAndSubmit(
        makeSigner(captured).buildOrder({ symbol: 'BTC-USD', side: 'SELL', type: 'STOP_MARKET', amount: '0.01' })
      )
    ).rejects.toThrow(/requires triggerPrice/);
  });

  it('cancels by resolved asset index + numeric oid', async () => {
    const captured: Captured[] = [];
    const res = await makeSigner(captured).cancel({ symbol: 'ETH-USD', orderId: 555 });
    const action = captured[0].action as { type: string; cancels: unknown[] };
    expect(action.type).toBe('cancel');
    expect(action.cancels[0]).toEqual({ a: 1, o: 555 });
    expect(res.success).toBe(true);
  });

  it('includes the builder fee in the order action when configured', async () => {
    const captured: Captured[] = [];
    const signer = new HyperliquidSigner({
      privateKey: TEST_KEY,
      endpoint: { apiUrl: 'https://api.hyperliquid-testnet.xyz' },
      infoClient: fakeInfo(),
      builder: { address: `0x${'a'.repeat(40)}`, feeTenthsBps: 50 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: fakeTransport(captured) as any,
    });
    await signer.signAndSubmit(
      signer.buildOrder({ symbol: 'BTC-USD', side: 'BUY', type: 'LIMIT', amount: '0.001', price: '64000' })
    );
    const action = captured[0].action as { builder?: { b: string; f: number } };
    expect(action.builder).toEqual({ b: `0x${'a'.repeat(40)}`, f: 50 });
  });

  it('updates leverage (cross) for the resolved asset', async () => {
    const captured: Captured[] = [];
    const res = await makeSigner(captured).updateLeverage('BTC-USD', 5);
    const action = captured[0].action as { type: string; asset: number; isCross: boolean; leverage: number };
    expect(action.type).toBe('updateLeverage');
    expect(action.asset).toBe(0);
    expect(action.isCross).toBe(true);
    expect(action.leverage).toBe(5);
    expect(res.success).toBe(true);
  });

  it('updates leverage (isolated) when isCross=false', async () => {
    const captured: Captured[] = [];
    await makeSigner(captured).updateLeverage('BTC-USD', 10, false);
    const action = captured[0].action as { type: string; isCross: boolean; leverage: number };
    expect(action.type).toBe('updateLeverage');
    expect(action.isCross).toBe(false);
    expect(action.leverage).toBe(10);
  });
});
