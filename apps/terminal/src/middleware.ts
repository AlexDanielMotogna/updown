import { NextResponse, type NextRequest } from 'next/server';

/**
 * Force every /api response to be uncacheable. The terminal's data routes
 * (orders, tpsl, positions, trades, …) are live account state read from
 * HyperLiquid; without this, Railway's edge/proxy can serve a stale cached
 * response, so the UI shows orders/positions that were already cancelled/closed
 * (worked on localhost — dev disables caching — but not on prod). `force-dynamic`
 * on the routes isn't enough; the response itself must say no-store.
 */
export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  return res;
}

export const config = { matcher: '/api/:path*' };
