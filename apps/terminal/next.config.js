/** @type {import('next').NextConfig} */
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
};

module.exports = nextConfig;
