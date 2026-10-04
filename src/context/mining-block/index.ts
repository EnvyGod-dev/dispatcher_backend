import { drizzleDb } from '$/libs/database/db';
import { dailyPlans, miningBlocks } from '$/libs/database/schema';
import { first, firstOrNull, type PaginationType } from '$/libs/database/utils';
import { and, desc, eq, getTableColumns, ilike, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

type MiningBlockInput = typeof miningBlocks.$inferInsert;

export const getMiningBlocks = async (
  { offset, limit }: PaginationType,
  {
    organizationId,
    search,
    isActive,
    layerNumber,
  }: {
    organizationId: string;
    search?: string;
    isActive?: boolean;
    layerNumber?: string;
  }
) => {
  return drizzleDb
    .select({
      ...getTableColumns(miningBlocks),
      linkedPlanCount:
        sql<number>`COUNT(DISTINCT ${dailyPlans.id})::int`.as('linked_plan_count'),
      totalCount: sql<number>`count(*) OVER()`.as('total_count'),
    })
    .from(miningBlocks)
    .leftJoin(dailyPlans, eq(dailyPlans.pickUpBlockId, miningBlocks.id))
    .where(
      and(
        eq(miningBlocks.organizationId, organizationId),
        search ? ilike(miningBlocks.name, `%${search}%`) : undefined,
        typeof isActive === 'boolean'
          ? eq(miningBlocks.isActive, isActive)
          : undefined,
        layerNumber ? ilike(miningBlocks.layerNumber, `%${layerNumber}%`) : undefined
      )
    )
    .groupBy(miningBlocks.id)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(miningBlocks.createdAt));
};

export const getMiningBlockByName = async (name: string) => {
  return firstOrNull(
    await drizzleDb
      .select()
      .from(miningBlocks)
      .where(eq(miningBlocks.name, name))
  );
};
export const createMiningBlock = async (input: MiningBlockInput) => {
  return first(await drizzleDb.insert(miningBlocks).values(input).returning());
};

export const getMiningBlockById = async (id: string) => {
  return firstOrNull(
    await drizzleDb.select().from(miningBlocks).where(eq(miningBlocks.id, id))
  );
};

export const getMiningBlockLinkedPlanCount = async ({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) => {
  const result = await drizzleDb
    .select({ count: sql<number>`COUNT(*)::int`.as('count') })
    .from(dailyPlans)
    .innerJoin(miningBlocks, eq(miningBlocks.id, dailyPlans.pickUpBlockId))
    .where(
      and(
        eq(dailyPlans.pickUpBlockId, id),
        eq(miningBlocks.organizationId, organizationId)
      )
    );

  return result[0]?.count ?? 0;
};

export const deleteMiningBlock = async ({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) => {
  const linkedPlanCount = await getMiningBlockLinkedPlanCount({
    id,
    organizationId,
  });

  if (linkedPlanCount > 0) {
    throw new HTTPException(422, {
      message:
        'Энэ блок төлөвлөгөөнд ашиглагдсан тул устгах боломжгүй. Идэвхгүй болгоно уу.',
    });
  }

  await drizzleDb
    .delete(miningBlocks)
    .where(
      and(
        eq(miningBlocks.id, id),
        eq(miningBlocks.organizationId, organizationId)
      )
    );

  return true;
};

export const updateMiningBlock = async ({
  id,
  input,
}: {
  id: string;
  input: Partial<MiningBlockInput>;
}) => {
  return first(
    await drizzleDb
      .update(miningBlocks)
      .set(input)
      .where(eq(miningBlocks.id, id))
      .returning()
  );
};
