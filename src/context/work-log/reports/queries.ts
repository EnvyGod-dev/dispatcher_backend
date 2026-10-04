import type { ShiftStatus, ShiftType } from '$/context/shift/types';
import { drizzleDb } from '$/libs/database/db';
import { buildDriverNameFilter } from '$/utils/driver-name-filter';
import {
  dailyPlans,
  shifts,
  users,
  vehicles,
  workLogs,
} from '$/libs/database/schema';
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  sql,
} from 'drizzle-orm';

type WorkLogInput = {
  organizationId: string;
  vehicleId?: string;
  driverId?: string;
  driverName?: string;
  vehicleCode?: string;
  status?: ShiftStatus;
  stockpileId?: string;
  miningBlockId?: string;
  operationalDate?: string;
  startDate?: string;
  endDate?: string;
  shiftType?: ShiftType;
};

const effectiveOperationalDate = sql<string>`COALESCE(${shifts.operationalDate}, ${shifts.createdAt}::date)`;

const getFilteredShiftIds = async (
  {
    vehicleId,
    driverId,
    driverName,
    vehicleCode,
    status,
    stockpileId,
    miningBlockId,
    operationalDate,
    organizationId,
    shiftType,
    startDate,
    endDate,
  }: WorkLogInput,
  { limit, offset }: { limit?: number; offset?: number } = {}
) => {
  const baseConditions = and(
    eq(shifts.organizationId, organizationId),
    status ? eq(shifts.status, status) : undefined,
    shiftType ? eq(shifts.shiftType, shiftType) : undefined,
    operationalDate
      ? sql`${effectiveOperationalDate} = ${operationalDate}`
      : undefined,
    startDate ? gte(shifts.createdAt, `${startDate}T00:00:00`) : undefined,
    endDate ? lte(shifts.createdAt, `${endDate}T23:59:59`) : undefined,
    driverId ? eq(shifts.driverId, driverId) : undefined,
    vehicleId ? eq(shifts.vehicleId, vehicleId) : undefined
  );

  let shiftIdFilter: string[] | null = null;

  if (stockpileId || miningBlockId) {
    const filteredShiftIds = await drizzleDb
      .selectDistinct({ id: shifts.id })
      .from(shifts)
      .innerJoin(workLogs, eq(workLogs.shiftId, shifts.id))
      .leftJoin(dailyPlans, eq(dailyPlans.id, workLogs.planId))
      .where(
        and(
          eq(shifts.organizationId, organizationId),
          stockpileId ? eq(workLogs.stockpileId, stockpileId) : undefined,
          miningBlockId
            ? eq(dailyPlans.pickUpBlockId, miningBlockId)
            : undefined
        )
      )
      .execute();

    if (filteredShiftIds.length === 0) {
      return [];
    }

    shiftIdFilter = filteredShiftIds.map((shift) => shift.id);
  }

  const finalConditions = shiftIdFilter
    ? and(baseConditions, inArray(shifts.id, shiftIdFilter))
    : baseConditions;

  const query = drizzleDb
    .selectDistinct({ id: shifts.id, createdAt: shifts.createdAt })
    .from(shifts)
    .leftJoin(users, eq(users.id, shifts.driverId))
    .leftJoin(vehicles, and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)))
    .where(
      and(
        finalConditions,
        isNull(vehicles.deletedAt),
        buildDriverNameFilter(driverName),
        vehicleCode ? ilike(vehicles.code, `%${vehicleCode}%`) : undefined
      )
    )
    .orderBy(desc(shifts.createdAt))
    .$dynamic();

  if (limit !== undefined) {
    query.limit(limit);
  }

  if (offset !== undefined) {
    query.offset(offset);
  }

  const shiftIds = await query.execute();

  return shiftIds.map((shift) => shift.id);
};

export const getWorkLogsByExcavator = async (
  filters: WorkLogInput,
  { limit, offset }: { limit?: number; offset?: number }
) => {
  const ids = await getFilteredShiftIds(filters, { limit, offset });

  if (ids.length === 0) {
    return [];
  }

  const worklogList = await drizzleDb.query.shifts.findMany({
    with: {
      driver: {
        columns: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      vehicle: true,
      workLogs: {
        with: {
          dailyPlan: {
            with: {
              vehicle: true,
              miningBlock: true,
            },
          },
          stockpile: true,
        },
      },
    },
    where: inArray(shifts.id, ids),
    orderBy: desc(shifts.createdAt),
  });

  return worklogList;
};

export const getWorkLogsByExcavatorCount = async ({
  vehicleId,
  driverId,
  driverName,
  vehicleCode,
  status,
  stockpileId,
  miningBlockId,
  operationalDate,
  organizationId,
  shiftType,
  startDate,
  endDate,
}: WorkLogInput) => {
  const shiftIds = await getFilteredShiftIds({
    vehicleId,
    driverId,
    driverName,
    vehicleCode,
    status,
    stockpileId,
    miningBlockId,
    operationalDate,
    organizationId,
    shiftType,
    startDate,
    endDate,
  });

  return shiftIds.length.toString();
};
