import { sql } from 'drizzle-orm';

export const getTotalCountSql = sql<number>`count(*) OVER()`.as('total_count');
