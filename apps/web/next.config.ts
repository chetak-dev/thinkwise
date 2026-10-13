import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@thinkwise/shared', '@thinkwise/db'],
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
};

export default nextConfig;
