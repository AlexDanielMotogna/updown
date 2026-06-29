/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

// Datafeed bridging the TradingView Charting Library to our HyperLiquid data:
// history from /api/klines (server-cached) and live bars from the WS candle feed
// (browser → HL direct). The library is loaded at runtime from /charting_library,
// so its types aren't imported here — the JS-API shape is implemented loosely.

import { getStream } from '@/lib/stream';
import { getMarketsCached } from '@/lib/marketsCache';
import { isSpotSymbol } from '@/lib/api';

const SUPPORTED_RESOLUTIONS = ['1', '5', '15', '60', '240', '1D'];
const RES_TO_INTERVAL: Record<string, string> = {
  '1': '1m', '5': '5m', '15': '15m', '60': '1h', '240': '4h', '1D': '1d', D: '1d',
};

interface RawCandle { timestamp: number; open: string; high: string; low: string; close: string; volume?: string }

/** Pick a TradingView pricescale (1/minmov resolution) from the asset's price. */
function priceScale(price: number): number {
  const a = Math.abs(price);
  if (!Number.isFinite(a) || a <= 0) return 100000;
  if (a >= 1000) return 100;        // 2dp
  if (a >= 1) return 1000;          // 3dp
  if (a >= 0.01) return 100000;     // 5dp
  return 100000000;                 // 8dp
}

/** Build a Charting Library datafeed backed by our klines route + WS candle feed. */
export function createTvDatafeed(): any {
  const subs = new Map<string, () => void>();

  return {
    onReady(cb: (config: any) => void) {
      setTimeout(() => cb({ supported_resolutions: SUPPORTED_RESOLUTIONS, supports_time: true, supports_marks: false, supports_timescale_marks: false }), 0);
    },

    searchSymbols(_userInput: string, _exchange: string, _type: string, onResult: (r: any[]) => void) {
      onResult([]); // symbol search is driven by our own MarketSelector, not the TV one
    },

    async resolveSymbol(symbolName: string, onResolve: (info: any) => void, onError: (e: string) => void) {
      try {
        const spot = isSpotSymbol(symbolName);
        let display = symbolName;
        let price = 0;
        try {
          const markets = await getMarketsCached(spot ? 'spot' : 'perp');
          const t = markets.find((m) => m.symbol === symbolName);
          if (t) { display = t.displayName ?? symbolName; price = Number(t.mark); }
        } catch { /* fall back to defaults */ }
        onResolve({
          name: display,
          ticker: symbolName, // our internal symbol — getBars/subscribeBars use this
          description: display,
          type: 'crypto',
          session: '24x7',
          timezone: 'Etc/UTC',
          exchange: 'HyperLiquid',
          listed_exchange: 'HyperLiquid',
          format: 'price',
          minmov: 1,
          pricescale: priceScale(price),
          has_intraday: true,
          has_daily: true,
          has_weekly_and_monthly: false,
          supported_resolutions: SUPPORTED_RESOLUTIONS,
          volume_precision: 2,
          data_status: 'streaming',
        });
      } catch (e) {
        onError(String(e));
      }
    },

    async getBars(symbolInfo: any, resolution: string, periodParams: any, onResult: (bars: any[], meta: { noData: boolean }) => void, onError: (e: string) => void) {
      const interval = RES_TO_INTERVAL[resolution] ?? '1h';
      try {
        const r = await fetch(`/api/klines?symbol=${encodeURIComponent(symbolInfo.ticker)}&interval=${interval}`, { cache: 'no-store' });
        const j = await r.json();
        if (!j.success) { onError(j.error?.message ?? 'klines failed'); return; }
        const fromMs = periodParams.from * 1000;
        const toMs = periodParams.to * 1000;
        const bars = (j.data as RawCandle[])
          .map((c) => ({ time: Number(c.timestamp), open: +c.open, high: +c.high, low: +c.low, close: +c.close, volume: +(c.volume ?? 0) }))
          .filter((b) => b.time >= fromMs && b.time <= toMs)
          .sort((a, b) => a.time - b.time);
        // Our klines is a fixed recent window — older paginated ranges return empty.
        onResult(bars, { noData: bars.length === 0 });
      } catch (e) {
        onError(String(e));
      }
    },

    subscribeBars(symbolInfo: any, resolution: string, onTick: (bar: any) => void, listenerGuid: string) {
      const interval = RES_TO_INTERVAL[resolution] ?? '1h';
      const unsub = getStream().subscribeCandle(symbolInfo.ticker, interval, (c) => {
        onTick({ time: c.time * 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
      });
      subs.set(listenerGuid, unsub);
    },

    unsubscribeBars(listenerGuid: string) {
      subs.get(listenerGuid)?.();
      subs.delete(listenerGuid);
    },
  };
}
