import { NextResponse } from 'next/server';
import { hlEndpoint } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

interface FrontendOrder {
  coin?: string;
  side?: string; // 'B' | 'A'
  limitPx?: string;
  sz?: string;
  oid?: number;
  timestamp?: number;
  origSz?: string;
  reduceOnly?: boolean;
  orderType?: string;
  isTrigger?: boolean;
  triggerPx?: string;
  triggerCondition?: string;
  isPositionTpsl?: boolean;
}

/** GET /api/orders?address=0x… → rich open orders (frontendOpenOrders): type,
 * direction, reduce-only, trigger condition, original size, etc. */
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

    const data = (Array.isArray(raw) ? raw : []).map((o) => {
      const buy = o.side === 'B';
      const reduce = !!o.reduceOnly;
      const direction = reduce ? (buy ? 'Close Short' : 'Close Long') : buy ? 'Open Long' : 'Open Short';
      const type = o.orderType ?? 'Limit';
      const isMarket = type.toLowerCase() === 'market';
      const sz = o.sz ?? '0';
      const limitPx = o.limitPx ?? '0';
      return {
        orderId: o.oid ?? 0,
        coin: o.coin ?? '?',
        symbol: `${o.coin ?? '?'}-USD`,
        side: buy ? 'BUY' : 'SELL',
        type,
        direction,
        size: sz,
        remaining: sz, // back-compat (AccountInfo resting value)
        origSize: o.origSz ?? sz,
        price: limitPx,
        isMarket,
        orderValue: String(Number(limitPx) * Number(sz)),
        reduceOnly: reduce,
        trigger: o.isTrigger ? { condition: o.triggerCondition ?? '', px: o.triggerPx ?? '' } : null,
        time: o.timestamp ?? 0,
      };
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[terminal] /api/orders error:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load orders' } }, { status: 500 });
  }
}
