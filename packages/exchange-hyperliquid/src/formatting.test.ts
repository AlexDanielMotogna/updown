import { describe, expect, it } from 'vitest';
import type { OrderParams } from 'exchange-core';
import {
  buildOrderRequest,
  formatPrice,
  formatSize,
  mapTif,
  stripTrailingZeros,
} from './formatting';

describe('formatting', () => {
  it('stripTrailingZeros', () => {
    expect(stripTrailingZeros('1.2300')).toBe('1.23');
    expect(stripTrailingZeros('5.0')).toBe('5');
    expect(stripTrailingZeros('64000')).toBe('64000');
  });

  it('formatSize rounds to szDecimals', () => {
    expect(formatSize('0.123456', 5)).toBe('0.12346');
    expect(formatSize('1.5', 0)).toBe('2'); // szDecimals 0 → integer
    expect(formatSize(0.1, 3)).toBe('0.1');
  });

  it('formatPrice enforces 5 sig figs and (6-szDecimals) decimals', () => {
    // BTC szDecimals 5 → max 1 decimal place
    expect(formatPrice('64001.5', 5)).toBe('64002'); // 5 sig figs
    expect(formatPrice('64000.0', 5)).toBe('64000');
    // szDecimals 4 → max 2 decimals; 5 sig figs
    expect(formatPrice('1.23456', 4)).toBe('1.23');
    // small price, szDecimals 2 → max 4 decimals
    expect(formatPrice('1.234567', 2)).toBe('1.2346');
  });

  it('formatPrice rejects non-positive', () => {
    expect(() => formatPrice('0', 5)).toThrow();
    expect(() => formatPrice('-1', 5)).toThrow();
  });

  it('mapTif maps normalized TIF → HL tif', () => {
    expect(mapTif('GTC')).toBe('Gtc');
    expect(mapTif('IOC')).toBe('Ioc');
    expect(mapTif('FOK')).toBe('Ioc');
    expect(mapTif('POST_ONLY')).toBe('Alo');
    expect(mapTif(undefined)).toBe('Gtc');
  });

  it('buildOrderRequest maps a limit buy', () => {
    const p: OrderParams = {
      symbol: 'BTC-USD',
      side: 'BUY',
      type: 'LIMIT',
      amount: '0.001',
      price: '64000',
      timeInForce: 'GTC',
    };
    expect(buildOrderRequest(p, 0, 5)).toEqual({
      a: 0,
      b: true,
      p: '64000',
      s: '0.001',
      r: false,
      t: { limit: { tif: 'Gtc' } },
    });
  });

  it('buildOrderRequest maps a stop-market sell with trigger', () => {
    const p: OrderParams = {
      symbol: 'ETH-USD',
      side: 'SELL',
      type: 'STOP_MARKET',
      amount: '0.5',
      price: '3000',
      triggerPrice: '2900',
      reduceOnly: true,
    };
    const r = buildOrderRequest(p, 1, 4);
    expect(r.b).toBe(false);
    expect(r.r).toBe(true);
    expect(r.t).toEqual({ trigger: { isMarket: true, triggerPx: '2900', tpsl: 'sl' } });
  });

  it('buildOrderRequest requires a price', () => {
    const p: OrderParams = { symbol: 'BTC-USD', side: 'BUY', type: 'MARKET', amount: '0.001' };
    expect(() => buildOrderRequest(p, 0, 5)).toThrow(/requires a price/);
  });
});
