import { drizzleDb } from '$/libs/database/db';
import {
  dailyPlans,
  miningSections,
  vehicleOrganizations,
  vehiclePictures,
  vehicles,
  workLogs,
} from '$/libs/database/schema';
import { first, firstOrNull, type PaginationType } from '$/libs/database/utils';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  ne,
  sql,
} from 'drizzle-orm';
import type { VehicleStatus, VehicleType } from './types';

type CreateVehicleInput = typeof vehicles.$inferInsert & {
  vehiclePictures?: ImageInput[];
};

type ImageInput = {
  position:
    | 'front'
    | 'rear'
    | 'left'
    | 'right'
    | 'left_front'
    | 'right_front'
    | 'left_rear'
    | 'right_rear';
  url: string;
  createdAt?: string;
  vehicleId?: string;
};

type UpdateVehicleInput = Partial<CreateVehicleInput> & {
  vehiclePictures?: ImageInput[];
};

export const VEHICLE_SORTABLE_COLUMNS = [
  'createdAt',
  'name',
  'code',
  'type',
  'status',
  'commissioningDate',
] as const;

export type VehicleSortColumn = (typeof VEHICLE_SORTABLE_COLUMNS)[number];

type VehicleFilterInput = {
  organizationId: string;
  type?: VehicleType;
  name?: string;
  status?: VehicleStatus;
  code?: string;
  vehicleNumber?: string;
  vehicleOrganizationId?: string;
  sortColumn?: VehicleSortColumn;
  sortOrder?: 'asc' | 'desc';
};

export const createVehicle = async (input: CreateVehicleInput) => {
  const createdVehicle = first(
    await drizzleDb.insert(vehicles).values(input).returning()
  );

  if (input.vehiclePictures && input.vehiclePictures.length > 0) {
    await drizzleDb.insert(vehiclePictures).values(
      input.vehiclePictures.map((img) => ({
        vehicleId: createdVehicle.id,
        position: img.position,
        url: img.url,
      }))
    );
  }

  return createdVehicle;
};

export const getVehicles = async (
  { offset, limit }: { offset: number; limit?: number },
  {
    organizationId,
    type,
    name,
    status,
    code,
    vehicleNumber,
    vehicleOrganizationId,
    sortColumn = 'createdAt',
    sortOrder = 'desc',
  }: VehicleFilterInput
) => {
  const subquery = drizzleDb
    .selectDistinctOn([vehicles.id], {
      ...getTableColumns(vehicles),
      totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
      pictureUrl: vehiclePictures.url,
      vehicleOrganizationName: sql<string | null>`${vehicleOrganizations.name}`.as('vehicleOrganizationName'),
      miningSectionName: sql<string | null>`${miningSections.name}`.as('miningSectionName'),
    })
    .from(vehicles)
    .leftJoin(
      vehicleOrganizations,
      eq(vehicleOrganizations.id, vehicles.vehicleOrganizationId)
    )
    .leftJoin(miningSections, eq(miningSections.id, vehicles.miningSectionId))
    .leftJoin(
      vehiclePictures,
      and(
        eq(vehiclePictures.vehicleId, vehicles.id),
        eq(vehiclePictures.position, 'right')
      )
    )
    .where(
      and(
        isNull(vehicles.deletedAt),
        eq(vehicles.organizationId, organizationId),
        type ? eq(vehicles.type, type) : undefined,
        name ? ilike(vehicles.name, `%${name}%`) : undefined,
        status ? eq(vehicles.status, status) : undefined,
        code ? ilike(vehicles.code, `%${code}%`) : undefined,
        vehicleNumber
          ? ilike(vehicles.vehicleNumber, `%${vehicleNumber}%`)
          : undefined,
        vehicleOrganizationId
          ? eq(vehicles.vehicleOrganizationId, vehicleOrganizationId)
          : undefined
      )
    )
    .orderBy(vehicles.id, desc(vehicles.createdAt))
    .as('v');

  const sortColumnMap = {
    createdAt: subquery.createdAt,
    name: subquery.name,
    code: subquery.code,
    type: subquery.type,
    status: subquery.status,
    commissioningDate: subquery.commissioningDate,
  };
  const col = sortColumnMap[sortColumn] ?? subquery.createdAt;
  const orderExpr = sortOrder === 'asc' ? asc(col) : desc(col);

  const query = drizzleDb
    .select()
    .from(subquery)
    .orderBy(orderExpr)
    .offset(offset);

  return limit === undefined ? query : query.limit(limit);
};

export const getVehicleByPk = async (id: string) => {
  const vehicle = await drizzleDb.query.vehicles.findFirst({
    with: {
      vehicleOrganization: true,
      miningSection: true,
      vehiclePictures: true,
    },
    where: and(eq(vehicles.id, id), isNull(vehicles.deletedAt)),
  });

  return vehicle;
};

export const getVehicleByPkIncludingDeleted = async (id: string) => {
  return drizzleDb.query.vehicles.findFirst({
    with: {
      vehicleOrganization: true,
      miningSection: true,
      vehiclePictures: true,
    },
    where: eq(vehicles.id, id),
  });
};

export const getVehiclePictures = async (id: string) => {
  return drizzleDb
    .select()
    .from(vehiclePictures)
    .where(eq(vehiclePictures.vehicleId, id));
};

export const deleteVehicle = async (id: string) => {
  return first(
    await drizzleDb
      .update(vehicles)
      .set({
        deletedAt: new Date().toISOString(),
      })
      .where(eq(vehicles.id, id))
      .returning()
  );
};

export const updateVehicle = async (id: string, input: UpdateVehicleInput) => {
  const updated = first(
    await drizzleDb
      .update(vehicles)
      .set(input)
      .where(eq(vehicles.id, id))
      .returning()
  );

  if (input.vehiclePictures && input.vehiclePictures.length > 0) {
    const pictures = input.vehiclePictures
      .filter((img) => !img.createdAt && !img.vehicleId)
      .map((img) => ({
        vehicleId: updated.id,
        position: img.position,
        url: img.url,
      }));

    const positionsToReplace = pictures.map((p) => p.position);

    await drizzleDb
      .delete(vehiclePictures)
      .where(
        and(
          eq(vehiclePictures.vehicleId, updated.id),
          inArray(vehiclePictures.position, positionsToReplace)
        )
      );

    if (pictures.length !== 0) {
      await drizzleDb.insert(vehiclePictures).values(pictures);
    }
  }

  return updated;
};

export const getVehicleWithoutJoin = async (
  {
    organizationId,
    type,
    excludedType,
  }: {
    organizationId: string;
    type?: VehicleType;
    excludedType?: VehicleType;
  },
  { limit, offset }: PaginationType
) => {
  return drizzleDb
    .select()
    .from(vehicles)
    .where(
      and(
        isNull(vehicles.deletedAt),
        eq(vehicles.organizationId, organizationId),
        type ? eq(vehicles.type, type) : undefined,
        excludedType ? ne(vehicles.type, excludedType) : undefined
      )
    )
    .limit(limit)
    .offset(offset);
};

export const getActiveExcaByPlanId = async (planId: string) => {
  return firstOrNull(
    await drizzleDb
      .select()
      .from(vehicles)
      .leftJoin(dailyPlans, eq(dailyPlans.vehicleId, vehicles.id))
      .leftJoin(workLogs, eq(workLogs.planId, dailyPlans.id))
      .where(
        and(
          eq(dailyPlans.id, planId),
          eq(workLogs.status, 'in_progress'),
          isNull(vehicles.deletedAt),
        ),
      )
  );
};
