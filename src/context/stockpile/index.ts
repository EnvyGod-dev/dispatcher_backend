import { drizzleDb } from '$/libs/database/db';
import { routes, stockpiles } from '$/libs/database/schema';
import { first, firstOrNull, type PaginationType } from '$/libs/database/utils';
import { and, desc, eq, getTableColumns, ilike } from 'drizzle-orm';
import { getTotalCountSql } from '../helpers';
import { NotFound, Unauthorized } from '$/utils/errors';

export type StockpileType = 'coal' | 'soil' | 'engineering' | 'common' | 'internal' | 'unproductive' | 'blast' | 'humus';
export type StockpileInput = typeof stockpiles.$inferInsert;

type StockpileInputs = {
  organizationId: string;
  type?: StockpileType;
  layerNumber?: string;
  createdBy?: string;
};

export const getStockpileByPk = async (id: string) => {
  return firstOrNull(
    await drizzleDb.select().from(stockpiles).where(eq(stockpiles.id, id))
  );
};

export const getStockpiles = async (
  { limit, offset }: PaginationType,
  { organizationId, type, layerNumber }: StockpileInputs
) => {
  return drizzleDb
    .select({
      ...getTableColumns(stockpiles),
      /** Холбосон маршрутын код (вебэд харуулна). */
      routeCode: routes.routeCode,
      totalCount: getTotalCountSql,
    })
    .from(stockpiles)
    .leftJoin(routes, eq(routes.id, stockpiles.routeId))
    .where(
      and(
        eq(stockpiles.organizationId, organizationId),
        type ? eq(stockpiles.type, type) : undefined,
        layerNumber ? ilike(stockpiles.layerNumber, `%${layerNumber}%`) : undefined
      )
    )
    .orderBy(desc(stockpiles.createdAt))
    .limit(limit)
    .offset(offset);
};

/** Маршрут тухайн байгууллагынх эсэхийг шалгана. */
export const assertRouteInOrganization = async (routeId: string, organizationId: string) => {
  const route = firstOrNull(
    await drizzleDb
      .select({ id: routes.id })
      .from(routes)
      .where(and(eq(routes.id, routeId), eq(routes.organizationId, organizationId)))
  );

  if (!route) {
    throw new NotFound('Маршрут олдсонгүй');
  }
};

export const createStockpile = async (input: StockpileInput) => {
  return first(await drizzleDb.insert(stockpiles).values(input).returning());
};

export const updateStockpile = async ({
  id,
  params,
}: {
  id: string;
  params: Partial<StockpileInput>;
}) => {
  const stockpile = await getStockpileByPk(id);

  if (!stockpile) {
    throw new NotFound();
  }

  if (stockpile?.organizationId !== params.organizationId) {
    throw new Unauthorized();
  }

  return first(
    await drizzleDb
      .update(stockpiles)
      .set({
        ...params,
      })
      .where(eq(stockpiles.id, id))
      .returning()
  );
};

export const deleteStockpile = async (id: string) => {
  return firstOrNull(
    await drizzleDb
      .update(stockpiles)
      .set({
        deactivatedAt: new Date().toISOString(),
      })
      .where(eq(stockpiles.id, id))
      .returning()
  );
};
