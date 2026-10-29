import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@thinkwise/shared', '@thinkwise/db'],
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  async redirects() {
    // Short join links: /123456 opens a live game's join screen, /1234567 a self-paced quiz.
    return [
      { source: '/:pin(\\d{6})', destination: '/play?pin=:pin', permanent: false },
      { source: '/:pin(\\d{7})', destination: '/play/self?pin=:pin', permanent: false },
    ];
  },
};

export default nextConfig;
