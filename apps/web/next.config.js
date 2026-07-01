/** @type {import('next').NextConfig} */
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
