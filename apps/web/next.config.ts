import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@thinkwise/shared', '@thinkwise/db'],
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  async redirects() {
    // Short join links: /123456 opens the join screen with that PIN filled in.
    return [{ source: '/:pin(\\d{6})', destination: '/play?pin=:pin', permanent: false }];
  },
};

export default nextConfig;
