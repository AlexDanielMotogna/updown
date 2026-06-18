/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship TS; let Next transpile them.
  transpilePackages: ['exchange-core', 'exchange-hyperliquid'],
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
