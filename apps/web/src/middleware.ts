import { NextResponse, type NextRequest } from 'next/server';
import { PROD_LOCKDOWN } from '@/lib/features';

/**
 * Production lockdown: while the app is under development, prod serves ONLY the
 * free World Cup predictions page. Every other route redirects to /worldcup, except
 * the admin panel (key-protected, needed to run the contest). In dev (PROD_LOCKDOWN
 * false) this is a no-op and the full app is reachable.
 */
export function middleware(req: NextRequest) {
  if (!PROD_LOCKDOWN) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // Let static asset requests (they carry a file extension) through.
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/worldcup';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals, the API, the World Cup page, and the
  // (key-protected) admin panel.
  matcher: ['/((?!_next|api|worldcup|admin|favicon.ico).*)'],
};
