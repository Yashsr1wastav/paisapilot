import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Silence the "multiple lockfiles" workspace-root warning that causes the slow cold start.
  // This tells Next.js that the project root is this directory, not C:\Users\yashr\.
  outputFileTracingRoot: path.join(process.cwd()),
  typescript: {
    // Use the web-specific tsconfig which has the correct paths/@/* alias and Next.js settings.
    // The root tsconfig.json is the backend/Node tsconfig and uses NodeNext module resolution
    // which is incompatible with Next.js's bundler expectations.
    tsconfigPath: './tsconfig.web.json',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: process.env.NODE_ENV === 'development' ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' http://127.0.0.1:3000 ws://localhost:3001; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;" : "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self' https://api.paisapilot.app http://127.0.0.1:3000; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  env: { NEXT_PUBLIC_APP_DOMAIN: 'paisapilot.app' },
};

export default nextConfig;
