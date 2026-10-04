import { drizzleDb } from '$/libs/database/db';
import { miningSections, vehicles } from '$/libs/database/schema';
import { first, firstOrNull, type PaginationType } from '$/libs/database/utils';
import { ClientError } from '$/utils/errors';
import { and, count, desc, eq, isNull, ne } from 'drizzle-orm';

type CreateMiningSectionInput = typeof miningSections.$inferInsert;

export const getMiningSectionById = async ({
  id,
  organizationId,
}: {
  id: string;
  organizationId?: string;
}) => {
  return firstOrNull(
    await drizzleDb
      .select()
      .from(miningSections)
      .where(
        and(
          eq(miningSections.id, id),
          organizationId
            ? eq(miningSections.organizationId, organizationId)
            : undefined
        )
      )
  );
};

export const getMiningSections = async (
  { limit, offset }: PaginationType,
  { organizationId }: { organizationId: string }
) => {
  return drizzleDb
    .select()
    .from(miningSections)
    .where(eq(miningSections.organizationId, organizationId))
    .orderBy(desc(miningSections.createdAt))
    .limit(limit)
    .offset(offset);
};

export const getMiningSectionCount = async ({
  organizationId,
}: {
  organizationId: string;
}) => {
  const query = firstOrNull(
    await drizzleDb
      .select({ count: count() })
      .from(miningSections)
      .where(eq(miningSections.organizationId, organizationId))
  );

  return query !== null ? query.count : 0;
};

export const createMiningSection = async (input: CreateMiningSectionInput) => {
  return first(
    await drizzleDb.insert(miningSections).values(input).returning()
  );
};

export const updateMiningSection = async ({
  id,
  name,
}: {
  id: string;
  name: string;
}) => {
  return firstOrNull(
    await drizzleDb
      .update(miningSections)
      .set({ name })
      .where(eq(miningSections.id, id))
      .returning()
  );
};

export const deleteMiningSection = async (id: string) => {
  const relatedVehicles = await drizzleDb
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.miningSectionId, id), isNull(vehicles.deletedAt)));

  if (relatedVehicles.length !== 0) {
    throw new ClientError(
      'Тус уулын хэсэгт хамааралтай техник ашиглагдаж байна.'
    );
  }

  return drizzleDb
    .delete(miningSections)
    .where(eq(miningSections.id, id))
    .returning();
};
