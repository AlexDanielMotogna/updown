import { NextResponse, type NextRequest } from 'next/server';

/**
 * Production lockdown: while the app is being moved to a development environment,
 * the PRODUCTION domain (updown.my) serves ONLY the deployment notice at /soon.
 * Every other route redirects there, including the Crypto Predictions event (now
 * finished) and the old /worldcup. The admin panel stays reachable because it is
 * key-protected and is how prizes get settled.
 *
 * The gate is the request HOST, not a build-time env flag, so every non-prod
 * environment — dev on Railway, previews, localhost — always gets the FULL app,
 * letting the team work normally. NEXT_PUBLIC_PROD_LOCKDOWN can still force the
 * lockdown ('true') or disable it ('false') anywhere for testing.
 *
 * NOTE: this hides the UI, it does not close the API. api.* stays reachable and
 * every mutating endpoint still works for anyone who calls it directly.
 */
const PROD_HOSTS = new Set(['updown.my', 'www.updown.my']);
const NOTICE_PATH = '/soon';

export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').toLowerCase().split(':')[0];
  const override = process.env.NEXT_PUBLIC_PROD_LOCKDOWN;
  const lock = override === 'true' ? true : override === 'false' ? false : PROD_HOSTS.has(host);
  if (!lock) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // Let static asset requests (they carry a file extension) through.
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = NOTICE_PATH;
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals, the API, the notice page itself
  // (redirecting it would loop), and the key-protected admin panel.
  matcher: ['/((?!_next|api|soon|admin|favicon.ico).*)'],
};
