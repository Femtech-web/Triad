import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  // The workspace packages ship TypeScript source; tracing starts at the repository root so they are bundled.
  transpilePackages: ['@triad/core', '@triad/evidence', '@triad/intel', '@triad/settle'],
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  serverExternalPackages: ['undici'],
  // The public record and the OFAC snapshot are read at runtime by the console's routes.
  outputFileTracingIncludes: { '/api/**': ['./data/**'], '/console': ['./data/**'] },
  headers: async () => [{ source: '/:path*', headers: SECURITY_HEADERS }],
  webpack: (webpack) => {
    // Packages import with NodeNext-style ".js" specifiers that point at ".ts" files, which only webpack maps.
    webpack.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return webpack;
  },
};
export default config;
