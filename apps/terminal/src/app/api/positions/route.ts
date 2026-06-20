import { NextResponse } from 'next/server';
import { readAdapter } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

/** GET /api/positions?address=0x… → account summary + open positions (public read). */
export async function GET(req: Request) {
  try {
    const address = new URL(req.url).searchParams.get('address');
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'valid address required' } }, { status: 400 });
    }
    const a = readAdapter();
    const [account, positions] = await Promise.all([a.getAccount(address), a.getPositions(address)]);
    return NextResponse.json({ success: true, data: { account, positions } });
  } catch (error) {
    console.error('[terminal] /api/positions error:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load positions' } }, { status: 500 });
  }
}
