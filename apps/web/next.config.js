/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['shared', 'solana-client'],
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
