/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship TS; let Next transpile them.
  transpilePackages: ['exchange-core', 'exchange-hyperliquid'],
  // Land on the trade view. A server-level redirect is more reliable in
  // production than redirect() in the root page (which prerenders static and can
  // 404 on some hosts).
  async redirects() {
    return [{ source: '/', destination: '/market/BTC-USD', permanent: false }];
  },
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
