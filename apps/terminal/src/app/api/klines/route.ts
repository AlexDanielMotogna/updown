import { NextResponse } from 'next/server';
import { readAdapter } from '@/lib/exchange';
import type { Candle } from 'exchange-core';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['1m', '5m', '15m', '1h', '4h', '1d']);
const LIMIT = 1500; // candles back — HL candleSnapshot caps ~5000 (≈62d @1h, ≈5d @1m)

// Short server-side cache (per symbol+interval) so N users viewing the same
// market don't each hit HL. The live updates come from the browser WS `candle`
// feed, so a 10s TTL on the historical snapshot is invisible. In-flight de-dup
// shares one upstream request across concurrent callers. Mirrors getTickers().
const CACHE_TTL_MS = 10_000;
const cache = new Map<string, { data: Candle[]; expires: number }>();
const inflight = new Map<string, Promise<Candle[]>>();

/** GET /api/klines?symbol=BTC-USD&interval=1h → normalized candles (cached 10s). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    const interval = url.searchParams.get('interval') ?? '1h';
    if (!symbol) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'symbol required' } }, { status: 400 });
    }
    const ivl = ALLOWED.has(interval) ? interval : '1h';
    const key = `${symbol}:${ivl}`;
    const now = Date.now();

    const hit = cache.get(key);
    if (hit && hit.expires > now) return NextResponse.json({ success: true, data: hit.data });

    let p = inflight.get(key);
    if (!p) {
      p = readAdapter()
        .getKlines({ symbol, interval: ivl, limit: LIMIT })
        .then((data) => { cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS }); return data; })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    const candles = await p;
    return NextResponse.json({ success: true, data: candles });
  } catch (error) {
    console.error('[terminal] /api/klines error:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load candles' } }, { status: 500 });
  }
}
