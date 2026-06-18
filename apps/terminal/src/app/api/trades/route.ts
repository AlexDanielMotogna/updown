import { NextResponse } from 'next/server';
import { readAdapter } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

/** GET /api/trades?address=0x… → recent fills / trade history (public read). */
export async function GET(req: Request) {
  try {
    const address = new URL(req.url).searchParams.get('address');
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'valid address required' } }, { status: 400 });
    }
    const trades = await readAdapter().getTradeHistory({ accountId: address, limit: 100 });
    return NextResponse.json({ success: true, data: trades });
  } catch (error) {
    console.error('[terminal] /api/trades error:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load trades' } }, { status: 500 });
  }
}
