import { NextResponse } from 'next/server';
import { hlEndpoint } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

interface HlFill {
  coin?: string;
  px?: string;
  sz?: string;
  side?: string; // 'B' | 'A'
  time?: number;
  dir?: string; // "Open Long" | "Close Long" | "Open Short" | "Close Short" | ...
  closedPnl?: string;
  fee?: string;
  hash?: string;
  oid?: number;
  tid?: number;
}

/** GET /api/trades?address=0x… → executed fills only (userFills), rich shape. */
export async function GET(req: Request) {
  try {
    const address = new URL(req.url).searchParams.get('address');
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'valid address required' } }, { status: 400 });
    }
    const res = await fetch(`${hlEndpoint().apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'userFills', user: address.toLowerCase() }),
    });
    if (!res.ok) throw new Error(`HL userFills ${res.status}`);
    const raw = (await res.json()) as HlFill[];

    const data = (Array.isArray(raw) ? raw : []).map((f) => ({
      id: String(f.tid ?? `${f.oid}-${f.time}`),
      oid: f.oid ?? 0,
      coin: f.coin ?? '?',
      symbol: `${f.coin ?? '?'}-USD`,
      direction: f.dir ?? (f.side === 'B' ? 'Buy' : 'Sell'),
      price: f.px ?? '0',
      size: f.sz ?? '0',
      tradeValue: String(Number(f.px ?? 0) * Number(f.sz ?? 0)),
      fee: f.fee ?? '0',
      pnl: f.closedPnl ?? '0',
      time: f.time ?? 0,
      hash: f.hash ?? '',
    }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[terminal] /api/trades error:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load trades' } }, { status: 500 });
  }
}
