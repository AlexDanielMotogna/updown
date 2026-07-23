/**
 * Shared security headers for apps/web and apps/terminal (Privy "Secure your app"
 * checklist). Required by each app's next.config.js `headers()`.
 *
 * CSP is ENV-DERIVED: origins that differ per environment (our API, Solana/EVM
 * RPCs) are read from NEXT_PUBLIC_* at BUILD time, so each deploy allows exactly
 * its own backends. Those vars must be present during `next build` (same Docker
 * ARG/ENV requirement as any other NEXT_PUBLIC_*), or their origins are omitted.
 *
 * ROLLOUT: CSP ships as Report-Only by default (logs violations to the browser
 * console, blocks nothing) so a wrong allowlist can't break the wallet/login in
 * prod. After verifying no violations during login + embedded wallet + placing an
 * order, set CSP_ENFORCE=true to switch to an enforcing policy. The other headers
 * (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) always enforce.
 */

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function wsOf(url) {
  const o = originOf(url);
  return o ? o.replace(/^http/, 'ws') : null;
}

function uniq(list) {
  return [...new Set(list.filter(Boolean))];
}

// Privy embedded-wallet + WalletConnect + Cloudflare Turnstile allowlist,
// straight from Privy's CSP guidance. Getting these wrong breaks the wallet.
// `privy.updown.my` is our CUSTOM Privy auth domain (prod proxies Privy through
// it instead of auth.privy.io) — it must be allowed in both frame-src and
// connect-src or login + the embedded-wallet iframe break under enforce.
const PRIVY_AUTH = ['https://auth.privy.io', 'https://privy.updown.my'];
const PRIVY_FRAME = [
  ...PRIVY_AUTH,
  'https://verify.walletconnect.com',
  'https://verify.walletconnect.org',
  'https://challenges.cloudflare.com',
];
const PRIVY_CONNECT = [
  ...PRIVY_AUTH,
  'https://*.rpc.privy.systems',
  'https://explorer-api.walletconnect.com',
  'wss://relay.walletconnect.com',
  'wss://relay.walletconnect.org',
  'wss://www.walletlink.org',
];

// Third-party backends both apps may reach (superset — trimmed later once
// Report-Only console output confirms what's actually used per app).
const WEB3_CONNECT = [
  // HyperLiquid (terminal perps/spot; web profile trading tab)
  'https://api.hyperliquid.xyz',
  'https://api.hyperliquid-testnet.xyz',
  'wss://api.hyperliquid.xyz',
  'wss://api.hyperliquid-testnet.xyz',
  // Pacifica (chart/market data)
  'https://api.pacifica.fi',
  'wss://ws.pacifica.fi',
  // Public Solana clusters (fallback when a custom RPC isn't set)
  'https://api.devnet.solana.com',
  'https://api.mainnet-beta.solana.com',
  'wss://api.devnet.solana.com',
  'wss://api.mainnet-beta.solana.com',
  // Media / avatars fetched via XHR (most are <img>, covered by img-src https:)
  'https://api.cloudinary.com',
  'https://api.dicebear.com',
];

/**
 * Build the CSP string. `connect`/`frame` add app-specific origins on top of the
 * shared Privy + web3 base.
 */
function buildCsp({ connect = [], frame = [] } = {}) {
  const api = process.env.NEXT_PUBLIC_API_URL;
  const rpcs = [
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL,
    process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL,
    process.env.NEXT_PUBLIC_HYPERLIQUID_API_URL,
  ];

  const envConnect = [];
  // API host, both https (fetch) and wss (socket.io upgrade) on the same origin.
  if (api) {
    envConnect.push(originOf(api), wsOf(api));
  }
  // Each configured RPC, plus its wss form (subscriptions).
  for (const rpc of rpcs) {
    if (rpc) envConnect.push(originOf(rpc), wsOf(rpc));
  }

  const connectSrc = uniq(["'self'", ...PRIVY_CONNECT, ...WEB3_CONNECT, ...envConnect, ...connect]);
  const frameSrc = uniq(["'self'", ...PRIVY_FRAME, ...frame]);

  return [
    "default-src 'self'",
    // 'unsafe-inline' for Next's inline bootstrap + the theme <script>; 'unsafe-eval'
    // for the webpack/runtime chunk loader. Turnstile script from Cloudflare.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
    // Emotion/MUI inject inline <style>; terminal @imports Google Fonts CSS.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // Images come from many CDNs (crests, coin icons, sportsdb, cloudinary, google
    // avatars). https: is a pragmatic bound — images are low XSS risk.
    "img-src 'self' data: blob: https:",
    `connect-src ${connectSrc.join(' ')}`,
    `frame-src ${frameSrc.join(' ')}`,
    // Service worker (push) + libs that spawn blob workers.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * Full header set for a Next `headers()` entry. Pass app-specific `connect`/`frame`
 * CSP extras. CSP is Report-Only unless CSP_ENFORCE=true.
 */
function buildSecurityHeaders(opts = {}) {
  const enforce = process.env.CSP_ENFORCE === 'true';
  return [
    {
      key: enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
      value: buildCsp(opts),
    },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
}

module.exports = { buildSecurityHeaders, buildCsp };
