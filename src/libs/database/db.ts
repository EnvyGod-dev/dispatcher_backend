import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import * as relations from './relations.js';
import { env } from '$/config/env.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  min: 2,
  max: 10,
  idleTimeoutMillis: 30000, // 30 seconds
  connectionTimeoutMillis: 10000, // 10 seconds
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on('connect', (client) => {
  const stack = new Error().stack;
  console.log(
    `🔗 Connection acquired. Pool: ${pool.totalCount} total, ${pool.idleCount} idle`
  );
  console.log('Stack trace:', stack?.split('\n').slice(1, 4).join('\n'));
});

pool.on('error', (err, client) => {
  console.error('🔥 Pool error:', err);
});

const dbSchema = {
  ...schema,
  ...relations,
} as const;

export const drizzleDb = drizzle(pool, {
  schema: dbSchema,
  logger: env.NODE_ENV === 'development',
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔒 Closing database connections...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔒 Closing database connections...');
  await pool.end();
  process.exit(0);
});
