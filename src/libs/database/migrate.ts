import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzleDb, pool } from './db';

export const migrateDB = async () => {
  console.log('migrating db');
  await migrate(drizzleDb, { migrationsFolder: 'drizzle' });
  console.log('db migrated');
  await pool.end();
};

migrateDB();