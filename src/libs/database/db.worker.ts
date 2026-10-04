// Cloudflare Workers compatible database configuration
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import * as relations from './relations.js';

// Get environment variables from Cloudflare Workers environment
function getEnv(key: string): string {
  // In Cloudflare Workers, env vars are available on the global object
  if (typeof globalThis !== 'undefined' && (globalThis as any)[key]) {
    return (globalThis as any)[key];
  }
  // Fallback for development/testing
  return process.env[key] || '';
}

export const createDatabase = (env?: any) => {
  const databaseUrl = env?.DATABASE_URL || getEnv('DATABASE_URL');

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  // Create postgres client with Workers-compatible configuration
  const client = postgres(databaseUrl, {
    prepare: false,
    // Cloudflare Workers specific optimizations
    idle_timeout: 20,
    max_lifetime: 60 * 30, // 30 minutes
    max: 1, // Workers have connection limits
  });

  const dbSchema = {
    ...schema,
    ...relations,
  } as const;

  return drizzle(client, {
    schema: dbSchema,
    logger: false, // Disable logging in production
  });
};

// Default export for backwards compatibility
// In Workers, this will be replaced by the env-aware version
let drizzleDb: ReturnType<typeof createDatabase>;

try {
  drizzleDb = createDatabase();
} catch (error) {
  console.warn('Failed to initialize default database connection:', error);
}

export { drizzleDb };
