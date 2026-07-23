/** @type {import('next').NextConfig} */
const { buildSecurityHeaders } = require('../../config/security-headers');

// Bake the deploy's git SHA into the client so VersionGate can detect stale
// bundles after a deploy. Railway exposes RAILWAY_GIT_COMMIT_SHA at build time.
const BUILD_ID = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

const nextConfig = {
  transpilePackages: ['shared', 'solana-client'],
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  generateBuildId: async () => (BUILD_ID !== 'dev' ? BUILD_ID : null),
  // Tournaments + Squads are temporarily disabled (under construction).
  // Remove these to re-enable, and restore the NAV_ITEMS entries.
  async redirects() {
    return [
      { source: '/tournaments', destination: '/', permanent: false },
      { source: '/tournament/:path*', destination: '/', permanent: false },
      { source: '/squads', destination: '/', permanent: false },
      { source: '/squads/:path*', destination: '/', permanent: false },
    ];
  },
  // Security headers (Privy "Secure your app"). CSP is env-derived + Report-Only
  // until CSP_ENFORCE=true. See config/security-headers.js.
  async headers() {
    return [{ source: '/:path*', headers: buildSecurityHeaders() }];
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
