import { NextResponse, type NextRequest } from 'next/server';
import { PROD_LOCKDOWN } from '@/lib/features';

/**
 * Production lockdown: while the app is under development, prod serves ONLY the
 * free World Cup predictions page. Every other route redirects to /worldcup. In
 * dev (PROD_LOCKDOWN false) this is a no-op and the full app is reachable.
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
  // public legal pages (Privacy Policy) linked from the World Cup footer.
  matcher: ['/((?!_next|api|worldcup|privacy|favicon.ico).*)'],
};
