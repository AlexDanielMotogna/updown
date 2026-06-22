import { NextResponse } from 'next/server';
import { hlEndpoint } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

/** TEMPORARY diagnostic. GET /api/_diag?address=0x… → what the SERVER actually
 * resolves + the RAW HyperLiquid response for frontendOpenOrders, so we can see
 * why /api/orders + /api/tpsl come back empty on Railway. Remove after debugging. */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get('address') ?? '';
  const ep = hlEndpoint().apiUrl;
  const out: Record<string, unknown> = {
    resolvedEndpoint: ep,
    env: {
      NEXT_PUBLIC_HYPERLIQUID_API_URL: process.env.NEXT_PUBLIC_HYPERLIQUID_API_URL ?? null,
      HYPERLIQUID_API_URL: process.env.HYPERLIQUID_API_URL ?? null,
      NEXT_PUBLIC_HYPERLIQUID_TESTNET: process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET ?? null,
    },
    user: address.toLowerCase(),
  };
  try {
    const res = await fetch(`${ep}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'frontendOpenOrders', user: address.toLowerCase() }),
      cache: 'no-store',
    });
    out.httpStatus = res.status;
    const text = await res.text();
    out.rawLength = text.length;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    out.isArray = Array.isArray(parsed);
    out.count = Array.isArray(parsed) ? parsed.length : null;
    out.rawSnippet = text.slice(0, 400);
  } catch (e) {
    out.fetchError = (e as Error).message;
  }
  return NextResponse.json(out);
}
