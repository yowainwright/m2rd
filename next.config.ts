import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/m2rd',
  trailingSlash: true,
  agentRules: false,
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
