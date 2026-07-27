import { NextResponse, type NextRequest } from 'next/server';

/**
 * Production lockdown: while the app is under development, the PRODUCTION domain
 * (updown.my) serves ONLY the Crypto Predictions event page. Every other route
 * (including the old /worldcup) redirects to /crypto-predictions, except the
 * admin panel (key-protected).
 *
 * The gate is the request HOST, not a build-time env flag, so every non-prod
 * environment — dev on Railway, previews, localhost — always gets the FULL app,
 * letting the team work normally. NEXT_PUBLIC_PROD_LOCKDOWN can still force the
 * lockdown ('true') or disable it ('false') anywhere for testing.
 */
const PROD_HOSTS = new Set(['updown.my', 'www.updown.my']);

export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').toLowerCase().split(':')[0];
  const override = process.env.NEXT_PUBLIC_PROD_LOCKDOWN;
  const lock = override === 'true' ? true : override === 'false' ? false : PROD_HOSTS.has(host);
  if (!lock) return NextResponse.next();

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
