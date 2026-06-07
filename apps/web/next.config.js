/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['shared', 'solana-client'],
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
