/** @type {import('next').NextConfig} */
const { buildSecurityHeaders } = require('../../config/security-headers');

const nextConfig = {
  // Workspace packages ship TS; let Next transpile them.
  transpilePackages: ['exchange-core', 'exchange-hyperliquid'],
  // NOTE: `/` is a mode-aware client page (Simple → catalog, Pro → client-redirect
  // to /trade/BTC/USDC). No server-level redirect here — it would intercept `/`
  // before the page can render the Simple catalog (PLAN-SIMPLE-MODE §3).
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
  // Security headers (Privy "Secure your app"). CSP is env-derived + Report-Only
  // until CSP_ENFORCE=true. TradingView charting_library needs its CDN allowed.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders({
          connect: ['https://www.tradingview.com', 'https://s3.tradingview.com'],
          // `blob:` because the TradingView charting library renders its chart
          // into iframes it creates from blob URLs. Without it the CSP reports a
          // frame-src violation on every chart load, and the chart would break
          // outright the moment CSP_ENFORCE=true.
          frame: ['https://www.tradingview.com', 'blob:'],
        }),
      },
    ];
  },
};

module.exports = nextConfig;
