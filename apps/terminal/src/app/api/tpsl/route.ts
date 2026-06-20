import { NextResponse } from 'next/server';
import { hlEndpoint } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

interface FrontendOrder {
  coin?: string;
  triggerPx?: string;
  isTrigger?: boolean;
  isPositionTpsl?: boolean;
  reduceOnly?: boolean;
  orderType?: string;
}

/** GET /api/tpsl?address=0x… → { "BTC-USD": { tp, sl } } from the position's
 * reduce-only trigger orders (frontendOpenOrders carries triggerPx + orderType). */
export async function GET(req: Request) {
  try {
    const address = new URL(req.url).searchParams.get('address');
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'valid address required' } }, { status: 400 });
    }
    const res = await fetch(`${hlEndpoint().apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'frontendOpenOrders', user: address.toLowerCase() }),
    });
    if (!res.ok) throw new Error(`HL frontendOpenOrders ${res.status}`);
    const raw = (await res.json()) as FrontendOrder[];

    const map: Record<string, { tp?: string; sl?: string }> = {};
    for (const o of Array.isArray(raw) ? raw : []) {
      if (!o.isTrigger || !o.triggerPx || !o.coin) continue;
      const sym = `${o.coin}-USD`;
      const type = (o.orderType ?? '').toLowerCase();
      map[sym] ??= {};
      if (type.includes('take profit')) map[sym].tp = o.triggerPx;
      else if (type.includes('stop')) map[sym].sl = o.triggerPx;
    }
    return NextResponse.json({ success: true, data: map });
  } catch (error) {
    console.error('[terminal] /api/tpsl error:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load TP/SL' } }, { status: 500 });
  }
}
