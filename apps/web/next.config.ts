import type { NextConfig } from 'next';

const config: NextConfig = {
  // The workspace packages ship TypeScript source.
  transpilePackages: ['@triad/core', '@triad/evidence', '@triad/intel', '@triad/settle'],
  poweredByHeader: false,
  serverExternalPackages: ['undici'],
  // The public record and the OFAC snapshot are read at runtime by the console's routes.
  outputFileTracingIncludes: { '/api/**': ['./data/**'], '/console': ['./data/**'] },
  webpack: (webpack) => {
    // Packages import with NodeNext-style ".js" specifiers that point at ".ts" files, which only webpack maps.
    webpack.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return webpack;
  },
};
export default config;
