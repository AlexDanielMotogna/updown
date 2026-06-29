import { NextResponse } from 'next/server';
import { readAdapter } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['1m', '5m', '15m', '1h', '4h', '1d']);
const POINTS = 24; // sparkline window
const MAX_SYMBOLS = 40;
// Sparklines change slowly and the live price comes from the WS feed, so a long
// TTL is fine — and it means N cards cost ~0 upstream after the first paint.
const TTL_MS = 60_000;
const cache = new Map<string, { closes: number[]; expires: number }>();
const inflight = new Map<string, Promise<number[]>>();

async function series(symbol: string, interval: string): Promise<number[]> {
  const key = `${symbol}:${interval}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.closes;
  let p = inflight.get(key);
  if (!p) {
    p = readAdapter()
      .getKlines({ symbol, interval, limit: POINTS + 2 }) // ~26 candles, not 1500
      .then((c) => {
        const closes = c.slice(-POINTS).map((x) => Number(x.close)).filter(Number.isFinite);
        cache.set(key, { closes, expires: Date.now() + TTL_MS });
        return closes;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/** GET /api/sparklines?symbols=BTC-USD,ETH-USD&interval=1h → { [symbol]: number[] }.
 *  One request for the whole catalog instead of one per card (each was downloading
 *  1500 candles to draw 24 points). Per-symbol cached + in-flight de-duped. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const interval = url.searchParams.get('interval') ?? '1h';
    const ivl = ALLOWED.has(interval) ? interval : '1h';
    const symbols = (url.searchParams.get('symbols') ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_SYMBOLS);
    const out: Record<string, number[]> = {};
    await Promise.all(symbols.map(async (s) => { try { out[s] = await series(s, ivl); } catch { out[s] = []; } }));
    return NextResponse.json({ success: true, data: out });
  } catch (error) {
    console.error('[terminal] /api/sparklines error:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load sparklines' } }, { status: 500 });
  }
}
