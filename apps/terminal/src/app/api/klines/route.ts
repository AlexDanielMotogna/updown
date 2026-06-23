import { NextResponse } from 'next/server';
import { readAdapter } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['1m', '5m', '15m', '1h', '4h', '1d']);

/** GET /api/klines?symbol=BTC-USD&interval=1h → normalized candles. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    const interval = url.searchParams.get('interval') ?? '1h';
    if (!symbol) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'symbol required' } }, { status: 400 });
    }
    const candles = await readAdapter().getKlines({
      symbol,
      interval: ALLOWED.has(interval) ? interval : '1h',
      // More history so the chart isn't just a couple of days. HL candleSnapshot
      // returns up to ~5000; 1500 gives plenty across intervals (≈62d @1h,
      // ≈5d @1m) without a heavy payload.
      limit: 1500,
    });
    return NextResponse.json({ success: true, data: candles });
  } catch (error) {
    console.error('[terminal] /api/klines error:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load candles' } }, { status: 500 });
  }
}
