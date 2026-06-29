import { NextResponse } from 'next/server';
import { hlEndpoint } from '@/lib/exchange';
import { cached } from '@/lib/serverCache';

export const dynamic = 'force-dynamic';
const TTL_MS = 20_000; // funding history barely changes; collapses the 4s client poll

interface HlFunding {
  delta?: { coin?: string; usdc?: string; fundingRate?: string; szi?: string };
  time?: number;
}

/** Funding payment history (perp settlements only). */

/** GET /api/funding?address=0x… → funding payment history (last 30d, public read). */
export async function GET(req: Request) {
  try {
    const address = new URL(req.url).searchParams.get('address');
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'valid address required' } }, { status: 400 });
    }
    const addr = address.toLowerCase();
    const data = await cached(`funding:${addr}`, TTL_MS, async () => {
      const startTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const res = await fetch(`${hlEndpoint().apiUrl}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'userFunding', user: addr, startTime }),
      });
      if (!res.ok) throw new Error(`HL userFunding ${res.status}`);
      const raw = (await res.json()) as HlFunding[];
      return (Array.isArray(raw) ? raw : [])
        .slice(0, 100)
        .map((f) => ({
          symbol: `${f.delta?.coin ?? '?'}-USD`,
          coin: f.delta?.coin ?? '?',
          usdc: f.delta?.usdc ?? '0',
          rate: f.delta?.fundingRate ?? '0',
          szi: f.delta?.szi ?? '0',
          time: f.time ?? 0,
        }))
        .reverse();
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[terminal] /api/funding error:', error);
    // Non-critical history — return empty rather than a 500 so the panel stays usable.
    return NextResponse.json({ success: true, data: [] });
  }
}
