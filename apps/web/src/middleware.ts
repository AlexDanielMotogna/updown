import { NextResponse, type NextRequest } from 'next/server';
import { PROD_LOCKDOWN } from '@/lib/features';

/**
 * Production lockdown: while the app is under development, prod serves ONLY the
 * Crypto Predictions event page. Every other route (including the old /worldcup)
 * redirects to /crypto-predictions, except the admin panel (key-protected). In dev
 * (PROD_LOCKDOWN false) this is a no-op and the full app is reachable.
 */
export function middleware(req: NextRequest) {
  if (!PROD_LOCKDOWN) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // Let static asset requests (they carry a file extension) through.
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/crypto-predictions';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals, the API, the event page, and the
  // (key-protected) admin panel.
  matcher: ['/((?!_next|api|crypto-predictions|admin|favicon.ico).*)'],
};
