import { NextResponse } from 'next/server';
import { readAdapter } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

/** GET /api/recenttrades?symbol=BTC-USD → recent market trades (public read). */
export async function GET(req: Request) {
  try {
    const symbol = new URL(req.url).searchParams.get('symbol');
    if (!symbol) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'symbol required' } }, { status: 400 });
    }
    const trades = await readAdapter().getRecentTrades(symbol);
    return NextResponse.json({ success: true, data: trades });
  } catch (error) {
    console.error('[terminal] /api/recenttrades error:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load trades' } }, { status: 500 });
  }
}
