import { build } from 'esbuild';

const start = Date.now();

try {
  await build({
    entryPoints: ['src/worker.ts'],
    bundle: true,
    minify: true,
    outfile: 'dist/index.js',
    target: 'es2022',
    format: 'esm',
    platform: 'neutral', // Cloudflare Workers environment
    conditions: ['worker', 'import'],
    external: [
      // Node.js built-ins that aren't available in Workers
      'fs',
      'path',
      'util',
      'events',
      'stream',
      'buffer',
      'querystring',
      'url',
      'os',
      'http',
      'https',
      'zlib',
      'tty',
      // Node.js specific packages that won't work in Workers
      'pg',
      'bcrypt',
      'winston',
      'node-cache',
      'clone',
    ],
    define: {
      'process.env.NODE_ENV': '"production"',
      'global': 'globalThis',
    },
    alias: {
      // Use Workers-compatible database
      '$/libs/database/db.js': '$/libs/database/db.worker.js',
    },
    mainFields: ['browser', 'module', 'main'],
    inject: [
      // Polyfills if needed
    ],
  });

  console.log(`✅ Build for Cloudflare Workers completed in ${Date.now() - start}ms`);
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}