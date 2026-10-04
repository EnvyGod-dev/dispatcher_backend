import { and, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import dayjs from 'dayjs';
import { drizzleDb } from '$/libs/database/db';
import { buildDriverNameFilter } from '$/utils/driver-name-filter';
import {
  dailyPlans,
  shiftInspections,
  shifts,
  users,
  vehicles,
  workLogs,
} from '$/libs/database/schema';

type ShiftKpiFilter = {
  organizationId: string;
  status?: 'started' | 'completed' | 'cancelled';
  shiftType?: 'day' | 'night';
  operationalDate?: string;
  startDate?: string;
  endDate?: string;
  driverId?: string;
  driverName?: string;
  vehicleId?: string;
  vehicleCode?: string;
  stockpileId?: string;
  miningBlockId?: string;
};

const effectiveOperationalDate = sql<string>`COALESCE(${shifts.operationalDate}, ${shifts.createdAt}::date)`;

const resolveShiftIdFilter = async ({
  organizationId,
  stockpileId,
  miningBlockId,
}: Pick<ShiftKpiFilter, 'organizationId' | 'stockpileId' | 'miningBlockId'>) => {
  if (!stockpileId && !miningBlockId) {
    return null;
  }

  const filteredShiftIds = await drizzleDb
    .selectDistinct({ id: shifts.id })
    .from(shifts)
    .innerJoin(workLogs, eq(workLogs.shiftId, shifts.id))
    .leftJoin(dailyPlans, eq(dailyPlans.id, workLogs.planId))
    .where(
      and(
        eq(shifts.organizationId, organizationId),
        stockpileId ? eq(workLogs.stockpileId, stockpileId) : undefined,
        miningBlockId ? eq(dailyPlans.pickUpBlockId, miningBlockId) : undefined,
      ),
    )
    .execute();

  return filteredShiftIds.map((shift) => shift.id);
};

export const getTopExca = async ({
  status,
  shiftType,
  operationalDate,
  startDate,
  endDate,
  driverId,
  driverName,
  vehicleId,
  vehicleCode,
  stockpileId,
  miningBlockId,
  organizationId,
}: ShiftKpiFilter) => {
  const defaultStartDate = dayjs().startOf('month').format('YYYY-MM-DD');
  const defaultEndDate = dayjs().endOf('month').format('YYYY-MM-DD');

  const actualStartDate = startDate || defaultStartDate;
  const actualEndDate = endDate || defaultEndDate;
  const shiftIdFilter = await resolveShiftIdFilter({
    organizationId,
    stockpileId,
    miningBlockId,
  });

  if (shiftIdFilter !== null && shiftIdFilter.length === 0) {
    return null;
  }

  const result = await drizzleDb
    .select({
      vehicleId: shifts.vehicleId,
      vehicleName: vehicles.name,
      vehicleCode: vehicles.code,
      totalProduction: sql<number>`
        COALESCE(
          SUM(COALESCE(${shifts.coalProduct}, 0) + COALESCE(${shifts.soilProduct}, 0)),
          0
        )
      `.as('total_production'),
      soilProduction: sql<number>`
        COALESCE(SUM(COALESCE(${shifts.soilProduct}, 0)), 0)
      `.as('soilProduction'),
      coalProduction: sql<number>`
        COALESCE(SUM(COALESCE(${shifts.coalProduct}, 0)), 0)
      `.as('coalProduction'),
    })
    .from(shifts)
    .leftJoin(workLogs, eq(shifts.id, workLogs.shiftId))
    .leftJoin(dailyPlans, eq(dailyPlans.id, workLogs.planId))
    .leftJoin(users, eq(users.id, shifts.driverId))
    .leftJoin(vehicles, and(eq(vehicles.id, dailyPlans.vehicleId), isNull(vehicles.deletedAt)))
    .where(
      and(
        eq(shifts.organizationId, organizationId),
        isNull(vehicles.deletedAt),
        status ? eq(shifts.status, status) : undefined,
        shiftType ? eq(shifts.shiftType, shiftType) : undefined,
        or(eq(shifts.status, 'completed'), eq(shifts.status, 'started')),
        operationalDate
          ? sql`${effectiveOperationalDate} = ${operationalDate}`
          : undefined,
        gte(sql`DATE(${shifts.createdAt})`, actualStartDate),
        lte(sql`DATE(${shifts.createdAt})`, actualEndDate),
        driverId ? eq(shifts.driverId, driverId) : undefined,
        vehicleId ? eq(shifts.vehicleId, vehicleId) : undefined,
        buildDriverNameFilter(driverName),
        vehicleCode
          ? sql`EXISTS (
              SELECT 1
              FROM vehicles shift_vehicle
              WHERE shift_vehicle.id = ${shifts.vehicleId}
                AND shift_vehicle.deleted_at IS NULL
                AND shift_vehicle.code ILIKE ${`%${vehicleCode}%`}
            )`
          : undefined,
        shiftIdFilter ? inArray(shifts.id, shiftIdFilter) : undefined,
      )
    )
    .groupBy(shifts.vehicleId, vehicles.name, vehicles.code)
    .orderBy(sql`total_production DESC`)
    .limit(1);

  return result[0] || null;
};

// get dump truck with most work logs
export const getMostActiveDump = async ({
  status,
  shiftType,
  operationalDate,
  startDate,
  endDate,
  driverId,
  driverName,
  vehicleId,
  vehicleCode,
  stockpileId,
  miningBlockId,
  organizationId,
}: ShiftKpiFilter) => {
  const defaultStartDate = dayjs().startOf('month').format('YYYY-MM-DD');
  const defaultEndDate = dayjs().endOf('month').format('YYYY-MM-DD');

  const actualStartDate = startDate || defaultStartDate;
  const actualEndDate = endDate || defaultEndDate;
  const shiftIdFilter = await resolveShiftIdFilter({
    organizationId,
    stockpileId,
    miningBlockId,
  });

  if (shiftIdFilter !== null && shiftIdFilter.length === 0) {
    return null;
  }

  const result = await drizzleDb
    .select({
      vehicleId: shifts.vehicleId,
      vehicleName: vehicles.name,
      vehicleCode: vehicles.code,
      tripCount: sql<number>`COUNT(DISTINCT ${workLogs.id})`.as('trip_count'),
      totalProduction: sql<number>`
        COALESCE(
          SUM(COALESCE(${shifts.coalProduct}, 0) + COALESCE(${shifts.soilProduct}, 0)),
          0
        )
      `.as('total_production'),
    })
    .from(shifts)
    .innerJoin(vehicles, and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)))
    .leftJoin(users, eq(users.id, shifts.driverId))
    .leftJoin(workLogs, eq(workLogs.shiftId, shifts.id))
    .where(
      and(
        eq(shifts.organizationId, organizationId),
        status ? eq(shifts.status, status) : undefined,
        shiftType ? eq(shifts.shiftType, shiftType) : undefined,
        or(eq(shifts.status, 'completed'), eq(shifts.status, 'started')),
        operationalDate
          ? sql`${effectiveOperationalDate} = ${operationalDate}`
          : undefined,
        gte(sql`DATE(${shifts.createdAt})`, actualStartDate),
        lte(sql`DATE(${shifts.createdAt})`, actualEndDate),
        driverId ? eq(shifts.driverId, driverId) : undefined,
        vehicleId ? eq(shifts.vehicleId, vehicleId) : undefined,
        buildDriverNameFilter(driverName),
        vehicleCode ? ilike(vehicles.code, `%${vehicleCode}%`) : undefined,
        shiftIdFilter ? inArray(shifts.id, shiftIdFilter) : undefined,
      )
    )
    .groupBy(shifts.vehicleId, vehicles.name, vehicles.code)
    .orderBy(sql`trip_count DESC`)
    .limit(1);

  return result[0] || null;
};

export const getMostActiveOperators = async ({
  status,
  shiftType,
  operationalDate,
  startDate,
  endDate,
  driverId,
  driverName,
  vehicleId,
  vehicleCode,
  stockpileId,
  miningBlockId,
  organizationId,
}: ShiftKpiFilter) => {
  const defaultStartDate = dayjs().startOf('month').format('YYYY-MM-DD');
  const defaultEndDate = dayjs().endOf('month').format('YYYY-MM-DD');

  const actualStartDate = startDate || defaultStartDate;
  const actualEndDate = endDate || defaultEndDate;
  const shiftIdFilter = await resolveShiftIdFilter({
    organizationId,
    stockpileId,
    miningBlockId,
  });

  if (shiftIdFilter !== null && shiftIdFilter.length === 0) {
    return [];
  }

  const commonConditions = and(
    eq(shifts.organizationId, organizationId),
    isNull(vehicles.deletedAt),
    status ? eq(shifts.status, status) : undefined,
    shiftType ? eq(shifts.shiftType, shiftType) : undefined,
    or(eq(shifts.status, 'completed'), eq(shifts.status, 'started')),
    operationalDate
      ? sql`${effectiveOperationalDate} = ${operationalDate}`
      : undefined,
    gte(sql`DATE(${shifts.createdAt})`, actualStartDate),
    lte(sql`DATE(${shifts.createdAt})`, actualEndDate),
    driverId ? eq(shifts.driverId, driverId) : undefined,
    vehicleId ? eq(shifts.vehicleId, vehicleId) : undefined,
    buildDriverNameFilter(driverName),
    vehicleCode ? ilike(vehicles.code, `%${vehicleCode}%`) : undefined,
    shiftIdFilter ? inArray(shifts.id, shiftIdFilter) : undefined,
  );

  const topOperators = await drizzleDb
    .select({
      driverId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      position: users.position,
      tripCount: sql<number>`COUNT(DISTINCT ${workLogs.id})`.as('trip_count'),
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.driverId))
    .leftJoin(vehicles, and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)))
    .innerJoin(workLogs, eq(workLogs.shiftId, shifts.id))
    .where(commonConditions)
    .groupBy(users.id, users.firstName, users.lastName, users.position)
    .orderBy(sql`trip_count DESC`, sql`${users.lastName} ASC`, sql`${users.firstName} ASC`)
    .limit(3);

  if (topOperators.length === 0) {
    return [];
  }

  const productionByDriver = await drizzleDb
    .select({
      driverId: shifts.driverId,
      totalProduction: sql<number>`
        COALESCE(
          SUM(COALESCE(${shifts.coalProduct}, 0) + COALESCE(${shifts.soilProduct}, 0)),
          0
        )
      `.as('total_production'),
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.driverId))
    .leftJoin(vehicles, and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)))
    .where(
      and(
        commonConditions,
        inArray(
          shifts.driverId,
          topOperators.map((operator) => operator.driverId),
        ),
      ),
    )
    .groupBy(shifts.driverId);

  const productionMap = new Map(
    productionByDriver.map((row) => [row.driverId, row.totalProduction]),
  );

  return topOperators.map((operator) => ({
    ...operator,
    totalProduction: productionMap.get(operator.driverId) ?? 0,
  }));
};

// get inspection summary for current filters
export const getTodayInspections = async ({
  status,
  shiftType,
  operationalDate,
  startDate,
  endDate,
  driverId,
  driverName,
  vehicleId,
  vehicleCode,
  stockpileId,
  miningBlockId,
  organizationId,
}: ShiftKpiFilter) => {
  const today = dayjs().format('YYYY-MM-DD');
  const actualStartDate = startDate || today;
  const actualEndDate = endDate || today;
  const shiftIdFilter = await resolveShiftIdFilter({
    organizationId,
    stockpileId,
    miningBlockId,
  });

  if (shiftIdFilter !== null && shiftIdFilter.length === 0) {
    return null;
  }

  const vehicleInspectionStates = drizzleDb
    .select({
      vehicleId: shifts.vehicleId,
      inspectionDate: sql<string>`MAX(DATE(${shiftInspections.createdAt}))`.as(
        'inspectionDate',
      ),
      highestSeverity: sql<number>`
        MAX(
          CASE
            WHEN ${shiftInspections.status} = 'issue' THEN 3
            WHEN ${shiftInspections.status} = 'needs_inspection' THEN 2
            WHEN ${shiftInspections.status} = 'normal' THEN 1
            ELSE 0
          END
        )
      `.as('highestSeverity'),
    })
    .from(shiftInspections)
    .innerJoin(shifts, eq(shifts.id, shiftInspections.shiftId))
    .leftJoin(users, eq(users.id, shifts.driverId))
    .leftJoin(vehicles, and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)))
    .where(
      and(
        eq(shifts.organizationId, organizationId),
        isNull(vehicles.deletedAt),
        status ? eq(shifts.status, status) : undefined,
        shiftType ? eq(shifts.shiftType, shiftType) : undefined,
        operationalDate
          ? sql`${effectiveOperationalDate} = ${operationalDate}`
          : undefined,
        gte(sql`DATE(${shiftInspections.createdAt})`, actualStartDate),
        lte(sql`DATE(${shiftInspections.createdAt})`, actualEndDate),
        driverId ? eq(shifts.driverId, driverId) : undefined,
        vehicleId ? eq(shifts.vehicleId, vehicleId) : undefined,
        buildDriverNameFilter(driverName),
        vehicleCode ? ilike(vehicles.code, `%${vehicleCode}%`) : undefined,
        shiftIdFilter ? inArray(shifts.id, shiftIdFilter) : undefined,
      )
    )
    .groupBy(shifts.vehicleId)
    .as('vehicle_inspection_states');

  const result = await drizzleDb
    .select({
      inspectionDate: sql<string>`COALESCE(MAX(${vehicleInspectionStates.inspectionDate}), ${actualEndDate})`.as(
        'inspectionDate',
      ),
      totalVehicles: sql<number>`COUNT(*)`.as('totalVehicles'),
      normalVehicleCount: sql<number>`
        COUNT(CASE WHEN ${vehicleInspectionStates.highestSeverity} = 1 THEN 1 END)
      `.as('normalVehicleCount'),
      needsInspectionVehicleCount: sql<number>`
        COUNT(CASE WHEN ${vehicleInspectionStates.highestSeverity} = 2 THEN 1 END)
      `.as('needsInspectionVehicleCount'),
      issueVehicleCount: sql<number>`
        COUNT(CASE WHEN ${vehicleInspectionStates.highestSeverity} = 3 THEN 1 END)
      `.as('issueVehicleCount'),
    })
    .from(vehicleInspectionStates);

  return result[0] || null;
};
