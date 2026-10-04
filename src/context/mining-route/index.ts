import { routes } from '$/libs/database/schema';
import { drizzleDb } from '$/libs/database/db';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import { first } from '$/libs/database/utils';

export type CreateRouteInput = typeof routes.$inferInsert;

export interface UpdateRouteInput {
  id: string;
  routeCode?: string;
  description?: string;
}

export async function getRouteById(id: string) {
  const route = await drizzleDb
    .select()
    .from(routes)
    .where(eq(routes.id, id))
    .limit(1);

  return route[0];
}

export async function getRoutes(
  pagination: { limit: number; offset: number },
  filters: { organizationId: string }
) {
  const whereConditions = [eq(routes.organizationId, filters.organizationId)];

  const routesList = await drizzleDb
    .select({
      ...getTableColumns(routes),
      totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
    })
    .from(routes)
    .where(and(...whereConditions))
    .limit(pagination.limit)
    .offset(pagination.offset)
    .orderBy(sql`${routes.createdAt} DESC`);

  return routesList;
}

export async function createRoute(input: CreateRouteInput) {
  const route = first(await drizzleDb.insert(routes).values(input).returning());

  return route;
}

export async function updateRoute(input: UpdateRouteInput) {
  const [route] = await drizzleDb
    .update(routes)
    .set(input)
    .where(eq(routes.id, input.id))
    .returning();

  return route;
}

export async function deleteRoute(id: string) {
  const [route] = await drizzleDb
    .delete(routes)
    .where(eq(routes.id, id))
    .returning();

  return route;
}
