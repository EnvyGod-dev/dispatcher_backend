import { drizzleDb } from '$/libs/database/db';
import { vehicleOrganizations, vehicles } from '$/libs/database/schema';
import { first, firstOrNull, type PaginationType } from '$/libs/database/utils';
import { ClientError } from '$/utils/errors';
import { count, desc, eq, getTableColumns } from 'drizzle-orm';

export const getVehicleOrganizations = async (
  { limit, offset }: PaginationType,
  { organizationId }: { organizationId: string }
) => {
  return drizzleDb
    .select({
      ...getTableColumns(vehicleOrganizations),
      vehicleCount: count(vehicles.id),
    })
    .from(vehicleOrganizations)
    .leftJoin(
      vehicles,
      eq(vehicles.vehicleOrganizationId, vehicleOrganizations.id)
    )
    .where(eq(vehicleOrganizations.organizationId, organizationId))
    .groupBy(vehicleOrganizations.id)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(vehicleOrganizations.createdAt));
};

export const getVehicleOrganizationCount = async ({
  organizationId,
}: {
  organizationId: string;
}) => {
  const query = firstOrNull(
    await drizzleDb
      .select({ count: count() })
      .from(vehicleOrganizations)
      .where(eq(vehicleOrganizations.organizationId, organizationId))
  );

  return query === null ? 0 : query.count;
};

export const createVehicleOrganization = async ({
  name,
  organizationId,
}: {
  name: string;
  organizationId: string;
}) => {
  return first(
    await drizzleDb
      .insert(vehicleOrganizations)
      .values({ name, organizationId })
      .returning()
  );
};

export const getVehicleOrganizationById = async (id: string) => {
  return firstOrNull(
    await drizzleDb
      .select()
      .from(vehicleOrganizations)
      .where(eq(vehicleOrganizations.id, id))
  );
};

export const updateVehicleOrganization = async ({
  id,
  name,
}: {
  id: string;
  name: string;
}) => {
  return firstOrNull(
    await drizzleDb
      .update(vehicleOrganizations)
      .set({ name })
      .where(eq(vehicleOrganizations.id, id))
      .returning()
  );
};

export const deleteVehicleOrganization = async (id: string) => {
  const relatedVehicles = await drizzleDb
    .select()
    .from(vehicles)
    .where(eq(vehicles.vehicleOrganizationId, id));

  if (relatedVehicles.length !== 0) {
    throw new ClientError('Тус байгууллагат хамааралтай техник байна.');
  }

  await drizzleDb
    .delete(vehicleOrganizations)
    .where(eq(vehicleOrganizations.id, id));

  return true;
};
