import { NextResponse } from 'next/server';
import { getTickers } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

/** GET /api/markets → normalized tickers (symbol, mark, 24h change, volume, max leverage). */
export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await getTickers() });
  } catch (error) {
    console.error('[terminal] /api/markets error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load markets' } },
      { status: 500 }
    );
  }
}
