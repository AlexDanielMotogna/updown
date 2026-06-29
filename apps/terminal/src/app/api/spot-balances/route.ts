import { NextResponse } from 'next/server';
import { getSpotBalances } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

/** GET /api/spot-balances?address=0x... → spot token holdings for the account. */
export async function GET(req: Request) {
  try {
    const address = new URL(req.url).searchParams.get('address');
    if (!address) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'address required' } },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, data: await getSpotBalances(address) });
  } catch (error) {
    console.error('[terminal] /api/spot-balances error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load spot balances' } },
      { status: 500 }
    );
  }
}
