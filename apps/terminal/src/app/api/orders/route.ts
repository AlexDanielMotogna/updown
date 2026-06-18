import { NextResponse } from 'next/server';
import { readAdapter } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

/** GET /api/orders?address=0x… → open orders (public read). */
export async function GET(req: Request) {
  try {
    const address = new URL(req.url).searchParams.get('address');
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'valid address required' } }, { status: 400 });
    }
    const orders = await readAdapter().getOpenOrders(address);
    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    console.error('[terminal] /api/orders error:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load orders' } }, { status: 500 });
  }
}
