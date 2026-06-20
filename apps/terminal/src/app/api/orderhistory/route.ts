import { NextResponse } from 'next/server';
import { hlEndpoint } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

interface HlHistOrder {
  order?: {
    coin?: string;
    side?: string; // 'B' | 'A'
    limitPx?: string;
    sz?: string; // remaining
    oid?: number;
    timestamp?: number;
    origSz?: string;
    reduceOnly?: boolean;
    orderType?: string;
    isTrigger?: boolean;
    triggerPx?: string;
    triggerCondition?: string;
  };
  status?: string;
  statusTimestamp?: number;
}

/** GET /api/orderhistory?address=0x… → full order lifecycle (historicalOrders). */
export async function GET(req: Request) {
  try {
    const address = new URL(req.url).searchParams.get('address');
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'valid address required' } }, { status: 400 });
    }
    const res = await fetch(`${hlEndpoint().apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'historicalOrders', user: address.toLowerCase() }),
    });
    if (!res.ok) throw new Error(`HL historicalOrders ${res.status}`);
    const raw = (await res.json()) as HlHistOrder[];

    const data = (Array.isArray(raw) ? raw : []).slice(0, 200).map((h) => {
      const o = h.order ?? {};
      const buy = o.side === 'B';
      const reduce = !!o.reduceOnly;
      const direction = reduce ? (buy ? 'Close Short' : 'Close Long') : buy ? 'Open Long' : 'Open Short';
      const type = o.orderType ?? 'Limit';
      const isMarket = type.toLowerCase() === 'market';
      const origSize = Number(o.origSz ?? o.sz ?? 0);
      const remaining = Number(o.sz ?? 0);
      const filled = Math.max(0, origSize - remaining);
      const limitPx = o.limitPx ?? '0';
      return {
        orderId: o.oid ?? 0,
        coin: o.coin ?? '?',
        symbol: `${o.coin ?? '?'}-USD`,
        direction,
        type,
        size: String(origSize),
        filledSize: String(filled),
        orderValue: String(Number(limitPx) * origSize),
        price: limitPx,
        isMarket,
        reduceOnly: reduce,
        trigger: o.isTrigger ? { condition: o.triggerCondition ?? '', px: o.triggerPx ?? '' } : null,
        status: h.status ?? 'unknown',
        time: o.timestamp ?? h.statusTimestamp ?? 0,
      };
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[terminal] /api/orderhistory error:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load order history' } }, { status: 500 });
  }
}
