import { NextResponse } from 'next/server';
import { getTickers, getSpotTickers } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

/** GET /api/markets[?kind=spot] → normalized tickers. Perps by default; spot pairs
 *  when `kind=spot`. */
export async function GET(req: Request) {
  try {
    const kind = new URL(req.url).searchParams.get('kind');
    const data = kind === 'spot' ? await getSpotTickers() : await getTickers();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[terminal] /api/markets error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load markets' } },
      { status: 500 }
    );
  }
}
