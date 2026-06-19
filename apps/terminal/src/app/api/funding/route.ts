import { NextResponse } from 'next/server';
import { hlEndpoint } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

interface HlFunding {
  delta?: { coin?: string; usdc?: string; fundingRate?: string; szi?: string };
  time?: number;
}

/** GET /api/funding?address=0x… → funding payment history (last 30d, public read). */
export async function GET(req: Request) {
  try {
    const address = new URL(req.url).searchParams.get('address');
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'valid address required' } }, { status: 400 });
    }
    const startTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const res = await fetch(`${hlEndpoint().apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'userFunding', user: address.toLowerCase(), startTime }),
    });
    if (!res.ok) throw new Error(`HL userFunding ${res.status}`);
    const raw = (await res.json()) as HlFunding[];
    const data = (Array.isArray(raw) ? raw : [])
      .slice(0, 100)
      .map((f) => ({
        symbol: `${f.delta?.coin ?? '?'}-USD`,
        usdc: f.delta?.usdc ?? '0',
        rate: f.delta?.fundingRate ?? '0',
        time: f.time ?? 0,
      }))
      .reverse();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[terminal] /api/funding error:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load funding' } }, { status: 500 });
  }
}
