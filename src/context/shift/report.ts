import { drizzleDb } from "$/libs/database/db";
import {
  dailyPlans,
  inspections,
  miningBlocks,
  routes,
  shiftInspections,
  shifts,
  shiftReportComments,
  stockpiles,
  users,
  vehicles,
  workLogs,
} from "$/libs/database/schema";
import { firstOrNull } from "$/libs/database/utils";
import dayjs from "dayjs";
import { buildDriverNameFilter } from "$/utils/driver-name-filter";

import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  sql,
  getTableColumns,
  or,
} from "drizzle-orm";
import type { DriverShiftGroup, ShiftStatus, ShiftType } from "./types";
import type { VehicleType } from "../vehicle/types";

export type ShiftInspectionReportFilter = {
  organizationId: string;
  operationalDate?: string;
  shiftType?: ShiftType;
  driverId?: string;
  vehicleId?: string;
  vehicleOrganizationId?: string;
  vehicleType?: VehicleType;
  inspectionState?: "all" | "done" | "not_done" | "has_issue";
};

export type ShiftReportFilter = {
  organizationId?: string;
  status?: ShiftStatus;
  shiftType?: ShiftType;
  operationalDate?: string;
  startDate?: string;
  endDate?: string;
  driverId?: string;
  vehicleId?: string;
  vehicleOrganizationId?: string;
  driverName?: string;
  stockpileId?: string;
  miningBlockId?: string;
  vehicleCode?: string;
  sortColumn?: SortableColumn;
  sortOrder?: "asc" | "desc";
};

export type TopDriverShiftGroup = {
  driverShiftGroup: DriverShiftGroup;
  production: string;
};

// sortable columns - note the subquery ones need special handling
export const SORTABLE_COLUMNS = {
  operationalDate: shifts.operationalDate,
  createdAt: shifts.createdAt,
  shiftStart: shifts.shiftStart,
  shiftEnd: shifts.shiftEnd,
  status: shifts.status,
  shiftType: shifts.shiftType,
  mileageStart: shifts.mileageStart,
  mileageEnd: shifts.mileageEnd,
  soilProduct: shifts.soilProduct,
  coalProduct: shifts.coalProduct,
  // these are computed, we'll handle them separately
  vehicle: "vehicle",
  coalWorkLogCount: "coalWorkLogCount",
  soilWorkLogCount: "soilWorkLogCount",
  shiftStatus: shifts.status,
} as const;

export type SortableColumn = keyof typeof SORTABLE_COLUMNS;

const effectiveOperationalDate = sql<string>`COALESCE(${shifts.operationalDate}, ${shifts.createdAt}::date)`;

// helper to build the order by clause
const buildOrderBy = (
  sortColumn: SortableColumn,
  sortOrder: "asc" | "desc",
) => {
  const direction = sortOrder === "asc" ? asc : desc;
  const fallbackOrder = [desc(shifts.createdAt), desc(shifts.id)] as const;

  switch (sortColumn) {
    case "operationalDate":
      return [direction(effectiveOperationalDate), ...fallbackOrder] as const;

    case "vehicle":
      return [direction(vehicles.code), ...fallbackOrder] as const;

    case "coalWorkLogCount":
      return [
        direction(sql`(
          SELECT COUNT(*) FROM work_logs wl
          INNER JOIN stockpiles s ON wl.stockpile_id = s.id
          WHERE wl.shift_id = shifts.id AND s.type = 'coal'
        )`),
        ...fallbackOrder,
      ] as const;

    case "soilWorkLogCount":
      return [
        direction(sql`(
          SELECT COUNT(*) FROM work_logs wl
          INNER JOIN stockpiles s ON wl.stockpile_id = s.id
          WHERE wl.shift_id = shifts.id AND s.type = 'soil'
        )`),
        ...fallbackOrder,
      ] as const;

    default:
      // direct column reference
      const column = SORTABLE_COLUMNS[sortColumn];
      if (typeof column === "string") {
        // shouldn't happen if we handled all string cases above
        throw new Error(`unhandled sort column: ${sortColumn}`);
      }
      return [direction(column), ...fallbackOrder] as const;
  }
};

export const getShiftReports = async (
  { limit, offset }: { offset: number; limit?: number },
  {
    status,
    shiftType,
    operationalDate,
    startDate,
    endDate,
    driverId,
    vehicleId,
    vehicleOrganizationId,
    organizationId,
    driverName,
    stockpileId,
    miningBlockId,
    vehicleCode,
    sortColumn = "createdAt",
    sortOrder = "desc",
  }: ShiftReportFilter,
) => {
  const orderColumn = SORTABLE_COLUMNS[sortColumn];

  const baseConditions = and(
    organizationId ? eq(shifts.organizationId, organizationId) : undefined,
    status ? eq(shifts.status, status) : undefined,
    shiftType ? eq(shifts.shiftType, shiftType) : undefined,
    operationalDate
      ? sql`${effectiveOperationalDate} = ${operationalDate}`
      : undefined,
    // Use timestamp range instead of DATE() to allow index usage
    startDate ? gte(shifts.createdAt, `${startDate}T00:00:00`) : undefined,
    endDate ? lte(shifts.createdAt, `${endDate}T23:59:59`) : undefined,
    driverId ? eq(shifts.driverId, driverId) : undefined,
    vehicleId ? eq(shifts.vehicleId, vehicleId) : undefined,
    vehicleOrganizationId
      ? eq(vehicles.vehicleOrganizationId, vehicleOrganizationId)
      : undefined,
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
          organizationId
            ? eq(shifts.organizationId, organizationId)
            : undefined,
          stockpileId ? eq(workLogs.stockpileId, stockpileId) : undefined,
          miningBlockId
            ? eq(dailyPlans.pickUpBlockId, miningBlockId)
            : undefined,
        ),
      )
      .execute();

    if (filteredShiftIds.length === 0) {
      return { data: [], totalCount: "0" };
    }
    shiftIdFilter = filteredShiftIds.map((s) => s.id);
  }

  const finalConditions = shiftIdFilter
    ? and(baseConditions, inArray(shifts.id, shiftIdFilter))
    : baseConditions;

  const countQuery = drizzleDb
    .select({ count: countDistinct(shifts.id) })
    .from(shifts)
    .leftJoin(users, eq(users.id, shifts.driverId))
    .leftJoin(
      vehicles,
      and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)),
    )
    .where(
      and(
        finalConditions,
        isNull(vehicles.deletedAt),
        buildDriverNameFilter(driverName),
        vehicleCode ? ilike(vehicles.code, `%${vehicleCode}%`) : undefined,
      ),
    );

  const dataQuery = drizzleDb
    .select({
      ...getTableColumns(shifts),
      operationalDate: effectiveOperationalDate.as("operational_date"),

      driver: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        position: users.position,
      },

      vehicle: {
        id: vehicles.id,
        code: vehicles.code,
        name: vehicles.name,
        type: vehicles.type,
      },

      // subquery for worklog count - avoids JOIN multiplication
      workLogsCount: sql<number>`
        (SELECT COUNT(*) FROM work_logs WHERE work_logs.shift_id = ${shifts.id})
      `.as("work_logs_count"),

      // subquery for coal worklog count
      coalWorkLogCount: sql<number>`
        (SELECT COUNT(*) FROM work_logs wl
         INNER JOIN stockpiles s ON wl.stockpile_id = s.id
         WHERE wl.shift_id = ${shifts.id} AND s.type = 'coal')
      `.as("coal_work_log_count"),

      // subquery for soil worklog count
      soilWorkLogCount: sql<number>`
        (SELECT COUNT(*) FROM work_logs wl
         INNER JOIN stockpiles s ON wl.stockpile_id = s.id
         WHERE wl.shift_id = ${shifts.id} AND s.type = 'soil')
      `.as("soil_work_log_count"),

      // subquery for inspection issues (uses index on shift_id, status)
      hasInspectionIssues: sql<boolean>`
        EXISTS(
          SELECT 1 FROM shift_inspections si
          WHERE si.shift_id = ${shifts.id}
          AND si.status != 'normal'
        )
      `.as("has_inspection_issues"),

      issueInspectionNames: sql<string>`
        COALESCE(
          (
            SELECT string_agg(DISTINCT i.name, ', ')
            FROM shift_inspections si
            INNER JOIN inspections i ON i.id = si.inspection_id
            WHERE si.shift_id = ${shifts.id}
              AND si.status IN ('issue', 'needs_inspection')
          ),
          ''
        )
      `.as("issue_inspection_names"),
    })
    .from(shifts)
    .leftJoin(users, eq(users.id, shifts.driverId))
    .leftJoin(
      vehicles,
      and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)),
    )
    .where(
      and(
        finalConditions,
        isNull(vehicles.deletedAt),
        buildDriverNameFilter(driverName),
        vehicleCode ? ilike(vehicles.code, `%${vehicleCode}%`) : undefined,
      ),
    )
    .orderBy(...buildOrderBy(sortColumn, sortOrder))
    .$dynamic();

  if (limit) {
    dataQuery.limit(limit);
  }

  if (offset) {
    dataQuery.offset(offset);
  }

  const [countResult, data] = await Promise.all([
    countQuery.execute(),
    dataQuery.execute(),
  ]);

  const totalCount = countResult[0]?.count?.toString() ?? "0";

  return { data, totalCount };
};

export const getShiftInspectionReports = async (
  { limit, offset }: { offset: number; limit?: number },
  {
    organizationId,
    operationalDate,
    shiftType,
    driverId,
    vehicleId,
    vehicleOrganizationId,
    vehicleType,
    inspectionState = "all",
  }: ShiftInspectionReportFilter,
) => {
  const baseConditions = and(
    eq(shifts.organizationId, organizationId),
    operationalDate
      ? sql`${effectiveOperationalDate} = ${operationalDate}`
      : undefined,
    shiftType ? eq(shifts.shiftType, shiftType) : undefined,
    driverId ? eq(shifts.driverId, driverId) : undefined,
    vehicleId ? eq(shifts.vehicleId, vehicleId) : undefined,
    vehicleOrganizationId
      ? eq(vehicles.vehicleOrganizationId, vehicleOrganizationId)
      : undefined,
    vehicleType ? eq(vehicles.type, vehicleType) : undefined,
    isNull(vehicles.deletedAt),
  );

  const inspectionStateCondition =
    inspectionState === "done"
      ? sql`COUNT(DISTINCT ${shiftInspections.id}) > 0`
      : inspectionState === "not_done"
        ? sql`COUNT(DISTINCT ${shiftInspections.id}) = 0`
        : inspectionState === "has_issue"
          ? sql`COUNT(DISTINCT CASE WHEN ${shiftInspections.status} IN ('issue', 'needs_inspection') THEN ${shiftInspections.id} END) > 0`
          : undefined;

  const countRows = await drizzleDb
    .select({
      shiftId: shifts.id,
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.driverId))
    .innerJoin(
      vehicles,
      and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)),
    )
    .leftJoin(shiftInspections, eq(shiftInspections.shiftId, shifts.id))
    .leftJoin(inspections, eq(inspections.id, shiftInspections.inspectionId))
    .where(baseConditions)
    .groupBy(shifts.id)
    .having(inspectionStateCondition);

  const dataQuery = drizzleDb
    .select({
      shiftId: shifts.id,
      operationalDate: effectiveOperationalDate.as("operational_date"),
      shiftType: shifts.shiftType,
      shiftStatus: shifts.status,
      shiftStart: shifts.shiftStart,
      shiftEnd: shifts.shiftEnd,
      driverId: users.id,
      driverFirstName: users.firstName,
      driverLastName: users.lastName,
      driverPosition: users.position,
      vehicleId: vehicles.id,
      vehicleCode: vehicles.code,
      vehicleName: vehicles.name,
      vehicleType: vehicles.type,
      hasInspection:
        sql<boolean>`COUNT(DISTINCT ${shiftInspections.id}) > 0`.as(
          "hasInspection",
        ),
      normalCount:
        sql<number>`COUNT(DISTINCT CASE WHEN ${shiftInspections.status} = 'normal' THEN ${shiftInspections.id} END)::int`.as(
          "normalCount",
        ),
      issueCount:
        sql<number>`COUNT(DISTINCT CASE WHEN ${shiftInspections.status} = 'issue' THEN ${shiftInspections.id} END)::int`.as(
          "issueCount",
        ),
      needsInspectionCount:
        sql<number>`COUNT(DISTINCT CASE WHEN ${shiftInspections.status} = 'needs_inspection' THEN ${shiftInspections.id} END)::int`.as(
          "needsInspectionCount",
        ),
      issueInspectionNames:
        sql<string>`COALESCE(string_agg(DISTINCT CASE WHEN ${shiftInspections.status} IN ('issue', 'needs_inspection') THEN ${inspections.name} END, ', '), '')`.as(
          "issueInspectionNames",
        ),
      issueInspectionTypes:
        sql<string>`COALESCE(string_agg(DISTINCT CASE WHEN ${shiftInspections.status} = 'issue' THEN 'issue' WHEN ${shiftInspections.status} = 'needs_inspection' THEN 'needs_inspection' END, ', '), '')`.as(
          "issueInspectionTypes",
        ),
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.driverId))
    .innerJoin(
      vehicles,
      and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)),
    )
    .leftJoin(shiftInspections, eq(shiftInspections.shiftId, shifts.id))
    .leftJoin(inspections, eq(inspections.id, shiftInspections.inspectionId))
    .where(baseConditions)
    .groupBy(
      shifts.id,
      shifts.operationalDate,
      shifts.shiftType,
      shifts.status,
      shifts.shiftStart,
      shifts.shiftEnd,
      users.id,
      users.firstName,
      users.lastName,
      users.position,
      vehicles.id,
      vehicles.code,
      vehicles.name,
      vehicles.type,
    )
    .having(inspectionStateCondition)
    .orderBy(desc(effectiveOperationalDate), desc(shifts.shiftStart))
    .$dynamic();

  if (limit) {
    dataQuery.limit(limit);
  }

  if (offset) {
    dataQuery.offset(offset);
  }

  const data = await dataQuery.execute();

  return {
    data,
    totalCount: countRows.length.toString(),
  };
};

export const getShiftWorkLogsByShift = async ({
  shiftId,
  organizationId,
}: {
  shiftId: string;
  organizationId: string;
}) => {
  return drizzleDb
    .select({
      ...getTableColumns(workLogs),
      stockPile: {
        id: stockpiles.id,
        type: stockpiles.type,
        layerNumber: stockpiles.layerNumber,
      },
      vehicle: {
        id: vehicles.id,
        code: vehicles.code,
      },
      dailyPlan: {
        id: dailyPlans.id,
        pickUpBlockId: dailyPlans.pickUpBlockId,
        vehicleId: dailyPlans.vehicleId,
        transportAmount: dailyPlans.transportAmount,
        date: dailyPlans.date,
        shiftType: dailyPlans.shiftType,
      },
      miningBlock: {
        id: miningBlocks.id,
        name: miningBlocks.name,
        layerNumber: miningBlocks.layerNumber,
      },
      route: {
        id: routes.id,
        routeCode: routes.routeCode,
      },
    })
    .from(workLogs)
    .leftJoin(dailyPlans, eq(dailyPlans.id, workLogs.planId))
    .leftJoin(
      vehicles,
      and(eq(dailyPlans.vehicleId, vehicles.id), isNull(vehicles.deletedAt)),
    )
    .leftJoin(miningBlocks, eq(dailyPlans.pickUpBlockId, miningBlocks.id))
    .leftJoin(stockpiles, eq(stockpiles.id, workLogs.stockpileId))
    .leftJoin(routes, eq(routes.id, dailyPlans.routeId))
    .where(
      and(
        eq(workLogs.shiftId, shiftId),
        eq(dailyPlans.organizationId, organizationId),
      ),
    )
    .orderBy(desc(workLogs.createdAt));
};

export const getShiftInspectionsByShift = async ({
  shiftId,
  organizationId,
}: {
  shiftId: string;
  organizationId: string;
}) => {
  return drizzleDb
    .select({
      ...getTableColumns(shiftInspections),
      inspection: {
        id: inspections.id,
        name: inspections.name,
        type: inspections.type,
      },
    })
    .from(shiftInspections)
    .leftJoin(inspections, eq(inspections.id, shiftInspections.inspectionId))
    .where(
      and(
        eq(shiftInspections.shiftId, shiftId),
        eq(inspections.organizationId, organizationId),
      ),
    )
    .orderBy(desc(shiftInspections.createdAt));
};

export const getShiftDetails = async ({
  shiftId,
  organizationId,
}: {
  shiftId: string;
  organizationId: string;
}) => {
  const [shiftData, workLogsData, inspectionsData] = await Promise.all([
    firstOrNull(
      await drizzleDb
        .select({
          id: shifts.id,
          operationalDate: effectiveOperationalDate.as("operational_date"),
          shiftType: shifts.shiftType,
          status: shifts.status,
          shiftStart: shifts.shiftStart,
          shiftEnd: shifts.shiftEnd,
          mileageStart: shifts.mileageStart,
          mileageEnd: shifts.mileageEnd,
          motoStart: shifts.motoStart,
          motoEnd: shifts.motoEnd,
          notes: shifts.notes,
          coalProduct: shifts.coalProduct,
          soilProduct: shifts.soilProduct,
          driver: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            position: users.position,
          },
          vehicle: {
            id: vehicles.id,
            code: vehicles.code,
            name: vehicles.name,
            type: vehicles.type,
          },
        })
        .from(shifts)
        .leftJoin(users, eq(users.id, shifts.driverId))
        .leftJoin(
          vehicles,
          and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)),
        )
        .where(
          and(
            eq(shifts.id, shiftId),
            eq(shifts.organizationId, organizationId),
            isNull(vehicles.deletedAt),
          ),
        ),
    ),
    getShiftWorkLogsByShift({ shiftId, organizationId }),
    getShiftInspectionsByShift({ shiftId, organizationId }),
  ]);

  return {
    shift: shiftData,
    workLogs: workLogsData,
    inspections: inspectionsData,
  };
};

export const getShiftCount = async ({
  status,
  shiftType,
  startDate,
  endDate,
  driverId,
  vehicleId,
  vehicleOrganizationId,
  organizationId,
  driverName,
  stockpileId,
  miningBlockId,
  vehicleCode,
}: ShiftReportFilter) => {
  const query = firstOrNull(
    await drizzleDb
      .select({ count: countDistinct(shifts.id) })
      .from(shifts)
      .where(
        and(
          organizationId
            ? eq(shifts.organizationId, organizationId)
            : undefined,
          status ? eq(shifts.status, status) : undefined,
          shiftType ? eq(shifts.shiftType, shiftType) : undefined,
          startDate
            ? gte(sql`DATE(${shifts.createdAt})`, startDate)
            : undefined,
          endDate ? lte(sql`DATE(${shifts.createdAt})`, endDate) : undefined,
          driverId ? eq(shifts.driverId, driverId) : undefined,
          vehicleId ? eq(shifts.vehicleId, vehicleId) : undefined,
          buildDriverNameFilter(driverName),
          isNull(vehicles.deletedAt),
          vehicleCode ? ilike(vehicles.code, `%${vehicleCode}%`) : undefined,
          stockpileId
            ? sql`${stockpileId} = ANY(${dailyPlans.stockpileIds})`
            : undefined,
          miningBlockId ? eq(miningBlocks.id, miningBlockId) : undefined,
        ),
      )
      .leftJoin(users, eq(users.id, shifts.driverId))
      .leftJoin(
        vehicles,
        and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)),
      )
      .leftJoin(workLogs, eq(workLogs.shiftId, shifts.id))
      .leftJoin(dailyPlans, eq(dailyPlans.id, workLogs.planId))
      .leftJoin(miningBlocks, eq(miningBlocks.id, dailyPlans.pickUpBlockId)),
  );

  return query !== null ? query.count.toString() : "0";
};

export const getShiftKpi = async ({
  status,
  shiftType,
  operationalDate,
  startDate,
  endDate,
  driverId,
  vehicleId,
  vehicleOrganizationId,
  organizationId,
  driverName,
  stockpileId,
  miningBlockId,
  vehicleCode,
}: ShiftReportFilter) => {
  const defaultStartDate = dayjs().startOf("month").format("YYYY-MM-DD");
  const defaultEndDate = dayjs().endOf("month").format("YYYY-MM-DD");

  const actualStartDate = startDate || defaultStartDate;
  const actualEndDate = endDate || defaultEndDate;

  const baseConditions = and(
    organizationId ? eq(shifts.organizationId, organizationId) : undefined,
    status ? eq(shifts.status, status) : undefined,
    shiftType ? eq(shifts.shiftType, shiftType) : undefined,
    operationalDate
      ? sql`${effectiveOperationalDate} = ${operationalDate}`
      : undefined,
    gte(sql`DATE(${shifts.createdAt})`, actualStartDate),
    lte(sql`DATE(${shifts.createdAt})`, actualEndDate),
    driverId ? eq(shifts.driverId, driverId) : undefined,
    vehicleId ? eq(shifts.vehicleId, vehicleId) : undefined,
    vehicleOrganizationId
      ? eq(vehicles.vehicleOrganizationId, vehicleOrganizationId)
      : undefined,
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
          organizationId
            ? eq(shifts.organizationId, organizationId)
            : undefined,
          stockpileId ? eq(workLogs.stockpileId, stockpileId) : undefined,
          miningBlockId
            ? eq(dailyPlans.pickUpBlockId, miningBlockId)
            : undefined,
        ),
      )
      .execute();

    if (filteredShiftIds.length === 0) {
      return {
        totalShifts: 0,
        completedShifts: 0,
        activeShifts: 0,
        cancelledShifts: 0,
        totalTrips: 0,
        averageTonnagePerShift: 0,
        averageTripsPerShift: 0,
        shiftsWithIssues: 0,
        normalInspectionCount: 0,
        issueInspectionCount: 0,
        needsInspectionCount: 0,
        totalProduction: 0,
        totalCoalProduction: 0,
        totalSoilProduction: 0,
        activeVehicles: 0,
        totalActiveVehicles: 0,
      };
    }

    shiftIdFilter = filteredShiftIds.map((shift) => shift.id);
  }

  const finalConditions = shiftIdFilter
    ? and(baseConditions, inArray(shifts.id, shiftIdFilter))
    : baseConditions;

  const productQuery = await drizzleDb
    .select({
      // production related
      totalProduction: sql<number>`
		COALESCE(
			SUM(COALESCE(${shifts.coalProduct}, 0) + COALESCE(${shifts.soilProduct}, 0)),
			0
		)
	`.as("totalProduction"),

      totalCoalProduction: sql<number>`
		SUM(COALESCE(coal_product, 0)) 
	`.as("totalCoalProduction"),

      totalSoilProduction: sql<number>`
		COALESCE(
			SUM(COALESCE(soil_product, 0)), 0
		)
	`.as("totalSoilProduction"),
    })
    .from(shifts)
    .leftJoin(users, eq(users.id, shifts.driverId))
    .leftJoin(
      vehicles,
      and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)),
    )
    .where(
      and(
        or(eq(shifts.status, "completed"), eq(shifts.status, "started")),
        finalConditions,
        isNull(vehicles.deletedAt),
        buildDriverNameFilter(driverName),
        vehicleCode ? ilike(vehicles.code, `%${vehicleCode}%`) : undefined,
      ),
    );

  const topDriverShiftGroup = firstOrNull(
    await drizzleDb
      .select({
        driverShiftGroup: shifts.driverShiftGroup,
        production: sql<string>`
          COALESCE(
            SUM(COALESCE(${shifts.coalProduct}, 0) + COALESCE(${shifts.soilProduct}, 0)),
            0
          )::text
        `.as('production'),
      })
      .from(shifts)
      .leftJoin(users, eq(users.id, shifts.driverId))
      .leftJoin(
        vehicles,
        and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)),
      )
      .where(
        and(
          or(eq(shifts.status, 'completed'), eq(shifts.status, 'started')),
          finalConditions,
          isNull(vehicles.deletedAt),
          sql`${shifts.driverShiftGroup} IS NOT NULL`,
          buildDriverNameFilter(driverName),
          vehicleCode ? ilike(vehicles.code, `%${vehicleCode}%`) : undefined,
        ),
      )
      .groupBy(shifts.driverShiftGroup)
      .orderBy(
        desc(
          sql`SUM(COALESCE(${shifts.coalProduct}, 0) + COALESCE(${shifts.soilProduct}, 0))`,
        ),
        asc(shifts.driverShiftGroup),
      )
      .limit(1),
  );

  const result = await drizzleDb
    .select({
      // shift related
      totalShifts: sql<number>`COUNT(DISTINCT ${shifts.id})`.as("totalShifts"),
      completedShifts:
        sql<number>`COUNT(DISTINCT CASE WHEN ${shifts.status} = 'completed' THEN ${shifts.id} END)`.as(
          "completedShifts",
        ),
      activeShifts:
        sql<number>`COUNT(DISTINCT CASE WHEN ${shifts.status} = 'started' THEN ${shifts.id} END)`.as(
          "activeShifts",
        ),
      cancelledShifts:
        sql<number>`COUNT(DISTINCT CASE WHEN ${shifts.status} = 'cancelled' THEN ${shifts.id} END)`.as(
          "cancelledShifts",
        ),

      //  reis related
      totalTrips: sql<number>`COUNT(DISTINCT ${workLogs.id})`.as("totalTrips"),
      averageTripsPerShift: sql<number>`
        COALESCE(
          COUNT(DISTINCT ${workLogs.id})::NUMERIC / NULLIF(COUNT(DISTINCT ${shifts.id}), 0),
          0
        )
      `.as("averageTripsPerShift"),

      // Inspection related
      shiftsWithIssues: sql<number>`
        COUNT(DISTINCT CASE 
          WHEN ${shiftInspections.status} IN ('issue', 'needs_inspection') 
          THEN ${shiftInspections.vehicleId} 
        END)
      `.as("shiftsWithIssues"),
      normalInspectionCount: sql<number>`
      COUNT(DISTINCT CASE 
          WHEN ${shiftInspections.status} = 'normal' 
          THEN ${shiftInspections.vehicleId} 
        END)
      `.as("normalInspectionCount"),

      issueInspectionCount: sql<number>`
      COUNT(DISTINCT CASE 
          WHEN ${shiftInspections.status} = 'issue' 
          THEN ${shiftInspections.vehicleId} 
        END)
      `.as("issueInspectionCount"),

      needsInspectionCount: sql<number>`
      COUNT(DISTINCT CASE 
          WHEN ${shiftInspections.status} = 'needs_inspection' 
          THEN ${shiftInspections.vehicleId} 
        END)
      `.as("needsInspectionCount"),

      // vehicle related
      activeVehicles: sql<number>`
        COUNT(DISTINCT CASE 
          WHEN (
            ${shifts.status} = 'started' 
            OR ${workLogs.status} = 'in_progress'
          ) 
          AND ${vehicles.status} = 'active'
          THEN ${shifts.vehicleId} 
        END)
        `.as("activeVehicles"),
      totalActiveVehicles: sql<number>`
        COUNT(DISTINCT CASE 
          WHEN ${vehicles.status} = 'active' 
          THEN ${vehicles.id} 
        END)
        `.as("totalActiveVehicles"),
    })
    .from(shifts)
    .leftJoin(workLogs, eq(workLogs.shiftId, shifts.id))
    .leftJoin(shiftInspections, eq(shiftInspections.shiftId, shifts.id))
    .leftJoin(users, eq(users.id, shifts.driverId))
    .leftJoin(
      vehicles,
      and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)),
    )
    .where(
      and(
        finalConditions,
        isNull(vehicles.deletedAt),
          buildDriverNameFilter(driverName),
          vehicleCode ? ilike(vehicles.code, `%${vehicleCode}%`) : undefined,
      ),
    );

  const data = {
    ...result[0],
    ...productQuery[0],
    topDriverShiftGroup: topDriverShiftGroup?.driverShiftGroup ?? null,
    topDriverShiftGroupProduction: topDriverShiftGroup?.production ?? '0',
  };

  return (
    data || {
      totalShifts: 0,
      completedShifts: 0,
      activeShifts: 0,
      cancelledShifts: 0,
      totalTrips: 0,
      totalTonnage: 0,
      averageTonnagePerShift: 0,
      averageTripsPerShift: 0,
      shiftsWithIssues: 0,
      normalInspectionCount: 0,
      issueInspectionCount: 0,
      needsInspectionCount: 0,
      totalProduction: 0,
      totalCoalProduction: 0,
      totalSoilProduction: 0,
      topDriverShiftGroup: null,
      topDriverShiftGroupProduction: 0,
      activeVehicles: 0,
      totalActiveVehicles: 0,
    }
  );
};

export type MonthlyAggregationFilter = {
  organizationId: string;
  year: number;
  month: number; // 1-12
  monthlyPlanTotal?: number; // coalAmount + soilAmount from monthly_plans
};

const buildMonthlyAggregationComment = (notes: string | null) => {
  if (!notes) {
    return null;
  }

  const uniqueNotes = Array.from(
    new Set(
      notes
        .split('\n')
        .map((note) => note.trim())
        .filter(Boolean),
    ),
  );

  return uniqueNotes.length > 0 ? uniqueNotes.join('\n') : null;
};

export const getMonthlyAggregationReport = async ({
  organizationId,
  year,
  month,
  monthlyPlanTotal = 0,
}: MonthlyAggregationFilter) => {
  const monthStr = month.toString().padStart(2, "0");
  const startDate = `${year}-${monthStr}-01`;
  const endDate = dayjs(`${year}-${monthStr}-01`)
    .endOf("month")
    .format("YYYY-MM-DD");
  const daysInMonth = dayjs(startDate).daysInMonth();
  const today = dayjs();
  const selectedMonth = dayjs(startDate);
  const isCurrentMonth = today.isSame(selectedMonth, 'month');
  const isFutureMonth = selectedMonth.isAfter(today, 'month');
  const elapsedDays = isFutureMonth
    ? 0
    : isCurrentMonth
      ? today.date()
      : daysInMonth;
  const monthlyShiftPlanCount = daysInMonth * 2;
  const elapsedShiftPlanCount = elapsedDays * 2;
  // Per-shift planned amount: monthly plan spread evenly across all shifts in the month.
  // If monthly plan is not configured, fall back to the direct sum of daily_plans for the month.
  let resolvedMonthlyPlanTotal = monthlyPlanTotal;
  if (resolvedMonthlyPlanTotal === 0) {
    const [directTotal] = await drizzleDb
      .select({
        total: sql<number>`COALESCE(SUM(${dailyPlans.transportAmount}::numeric), 0)::numeric`.as("total"),
      })
      .from(dailyPlans)
      .where(
        and(
          eq(dailyPlans.organizationId, organizationId),
          gte(dailyPlans.date, startDate),
          lte(dailyPlans.date, endDate),
        ),
      );
    resolvedMonthlyPlanTotal = Number(directTotal?.total) || 0;
  }
  const perShiftPlan = resolvedMonthlyPlanTotal > 0 ? resolvedMonthlyPlanTotal / monthlyShiftPlanCount : 0;
  const effectiveMonthlyOperationalDate = sql<string>`COALESCE(${shifts.operationalDate}, (${shifts.shiftStart} AT TIME ZONE 'Asia/Ulaanbaatar')::date, (${shifts.createdAt} AT TIME ZONE 'Asia/Ulaanbaatar')::date)`;

  const monthlyShiftRollups = drizzleDb
    .select({
      shiftId: shifts.id,
      day: sql<number>`EXTRACT(DAY FROM ${effectiveMonthlyOperationalDate})`.as("day"),
      shiftType: shifts.shiftType,
      coalProduct:
        sql<number>`COALESCE(${shifts.coalProduct}::numeric, 0)::numeric`.as(
          "coalProduct",
        ),
      soilProduct:
        sql<number>`COALESCE(${shifts.soilProduct}::numeric, 0)::numeric`.as(
          "soilProduct",
        ),
      workLogCount: sql<number>`COUNT(${workLogs.id})::int`.as("workLogCount"),
      coalWorkLogCount:
        sql<number>`COUNT(CASE WHEN ${stockpiles.type} = 'coal' THEN ${workLogs.id} END)::int`.as(
          "coalWorkLogCount",
        ),
      notes:
        sql<string | null>`NULLIF(TRIM(${shifts.notes}), '')`.as(
          'notes',
        ),
    })
    .from(shifts)
    .leftJoin(workLogs, eq(workLogs.shiftId, shifts.id))
    .leftJoin(stockpiles, eq(stockpiles.id, workLogs.stockpileId))
    .where(
      and(
        eq(shifts.organizationId, organizationId),
        gte(effectiveMonthlyOperationalDate, startDate),
        lte(effectiveMonthlyOperationalDate, endDate),
        or(eq(shifts.status, "completed"), eq(shifts.status, "started")),
      ),
    )
    .groupBy(
      shifts.id,
      shifts.shiftType,
      shifts.coalProduct,
      shifts.soilProduct,
      shifts.notes,
      effectiveMonthlyOperationalDate,
    )
    .as('monthly_shift_rollups');

  const shiftsData = await drizzleDb
    .select({
      day: monthlyShiftRollups.day,
      shiftType: monthlyShiftRollups.shiftType,
      coalProduct:
        sql<number>`COALESCE(SUM(${monthlyShiftRollups.coalProduct}), 0)::numeric`.as(
          "coalProduct",
        ),
      soilProduct:
        sql<number>`COALESCE(SUM(${monthlyShiftRollups.soilProduct}), 0)::numeric`.as(
          "soilProduct",
        ),
      workLogCount:
        sql<number>`COALESCE(SUM(${monthlyShiftRollups.workLogCount}), 0)::int`.as(
          "workLogCount",
        ),
      coalWorkLogCount:
        sql<number>`COALESCE(SUM(${monthlyShiftRollups.coalWorkLogCount}), 0)::int`.as(
          "coalWorkLogCount",
        ),
      notes:
        sql<string | null>`NULLIF(STRING_AGG(DISTINCT ${monthlyShiftRollups.notes}, E'\n'), '')`.as(
          'notes',
        ),
    })
    .from(monthlyShiftRollups)
    .groupBy(monthlyShiftRollups.day, monthlyShiftRollups.shiftType)
    .orderBy(monthlyShiftRollups.day, monthlyShiftRollups.shiftType);

  const commentsData = await drizzleDb
    .select({
      date: shiftReportComments.date,
      shiftType: shiftReportComments.shiftType,
      comment: shiftReportComments.comment,
    })
    .from(shiftReportComments)
    .where(
      and(
        eq(shiftReportComments.organizationId, organizationId),
        gte(shiftReportComments.date, startDate),
        lte(shiftReportComments.date, endDate),
      ),
    );

  // Key: "YYYY-MM-DD-shiftType" for reliable matching
  const commentsMap = new Map<string, string>();
  for (const c of commentsData) {
    commentsMap.set(`${c.date}-${c.shiftType}`, c.comment);
  }

  const dailyData = new Map<number, any>();

  for (const row of shiftsData) {
    if (Number(row.workLogCount) === 0) continue;

    const day = Number(row.day);

    if (!dailyData.has(day)) {
      dailyData.set(day, {
        day,
        dayShift: {
          trips: 0,
          production: 0,
          coalProduction: 0,
          coalTrips: 0,
          plannedAmount: 0,
          comment: null,
        },
        nightShift: {
          trips: 0,
          production: 0,
          coalProduction: 0,
          coalTrips: 0,
          plannedAmount: 0,
          comment: null,
        },
      });
    }

    const dayData = dailyData.get(day);

    const shiftData =
      row.shiftType === "day" ? dayData.dayShift : dayData.nightShift;

    const coalProduct = Number(row.coalProduct) || 0;
    const soilProduct = Number(row.soilProduct) || 0;

    shiftData.trips = row.workLogCount;
    shiftData.production = coalProduct + soilProduct;
    shiftData.coalProduction = coalProduct;
    shiftData.coalTrips = row.coalWorkLogCount;
    shiftData.plannedAmount = perShiftPlan;
  }

  // Apply comments after the shifts loop using full date keys to avoid EXTRACT float ambiguity
  for (const [key, comment] of commentsMap) {
    const [y, m, d, shiftType] = key.split('-');
    const day = Number(d);
    const dayData = dailyData.get(day);
    if (!dayData) continue;
    const shiftData = shiftType === 'day' ? dayData.dayShift : dayData.nightShift;
    shiftData.comment = comment;
  }

  const result = Array.from(dailyData.values()).map((dayData) => {
    const totalDayProduction =
      dayData.dayShift.production + dayData.nightShift.production;
    const totalPlannedAmount =
      dayData.dayShift.plannedAmount + dayData.nightShift.plannedAmount;
    const totalCoalProduction =
      dayData.dayShift.coalProduction + dayData.nightShift.coalProduction;

    return {
      day: dayData.day,
      dayShift: {
        trips: Number(dayData.dayShift.trips) || 0,
        production: Number(dayData.dayShift.production) || 0,
        plannedAmount: Number(dayData.dayShift.plannedAmount) || 0,
        performanceRatio:
          dayData.dayShift.plannedAmount > 0
            ? Number(
                (
                  dayData.dayShift.production / dayData.dayShift.plannedAmount
                ).toFixed(4),
              )
            : 0,
        coalTrips: Number(dayData.dayShift.coalTrips) || 0,
        coalProduction: Number(dayData.dayShift.coalProduction) || 0,
        comment: dayData.dayShift.comment,
      },
      nightShift: {
        trips: Number(dayData.nightShift.trips) || 0,
        production: Number(dayData.nightShift.production) || 0,
        plannedAmount: Number(dayData.nightShift.plannedAmount) || 0,
        performanceRatio:
          dayData.nightShift.plannedAmount > 0
            ? Number(
                (
                  dayData.nightShift.production /
                  dayData.nightShift.plannedAmount
                ).toFixed(4),
              )
            : 0,
        coalTrips: Number(dayData.nightShift.coalTrips) || 0,
        coalProduction: Number(dayData.nightShift.coalProduction) || 0,
        comment: dayData.nightShift.comment,
      },
      totalDayProduction: Number(totalDayProduction) || 0,
      totalPlannedAmount: Number(totalPlannedAmount) || 0,
      totalPerformanceRatio:
        totalPlannedAmount > 0
          ? Number((totalDayProduction / totalPlannedAmount).toFixed(4))
          : 0,
      totalCoalProduction: Number(totalCoalProduction) || 0,
    };
  });

  const monthlyTotals = result.reduce(
    (acc, day) => {
      acc.totalTrips += day.dayShift.trips + day.nightShift.trips;
      acc.totalProduction += day.totalDayProduction;
      acc.totalPlannedAmount += day.totalPlannedAmount;
      acc.totalCoalTrips += day.dayShift.coalTrips + day.nightShift.coalTrips;
      acc.totalCoalProduction += day.totalCoalProduction;
      acc.totalSoilProduction +=
        day.dayShift.production +
        day.nightShift.production -
        day.totalCoalProduction;
      return acc;
    },
    {
      totalTrips: 0,
      totalProduction: 0,
      totalPlannedAmount: 0,
      totalCoalTrips: 0,
      totalCoalProduction: 0,
      totalSoilProduction: 0,
    },
  );

  const monthlyPlanTotalProduction = resolvedMonthlyPlanTotal || 0;
  const cumulativePlanToDate =
    monthlyShiftPlanCount > 0
      ? Number(
          ((monthlyPlanTotalProduction * elapsedShiftPlanCount) / monthlyShiftPlanCount).toFixed(4),
        )
      : 0;
  const monthlyPlanFulfillmentRatio =
    monthlyPlanTotalProduction > 0
      ? Number((monthlyTotals.totalProduction / monthlyPlanTotalProduction).toFixed(4))
      : 0;
  const cumulativePlanFulfillmentRatio =
    cumulativePlanToDate > 0
      ? Number((monthlyTotals.totalProduction / cumulativePlanToDate).toFixed(4))
      : 0;
  const daysMetPlan = result.filter(
    (day) => day.totalPlannedAmount > 0 && day.totalPerformanceRatio >= 1,
  ).length;
  const daysMissedPlan = result.filter(
    (day) => day.totalPlannedAmount > 0 && day.totalPerformanceRatio < 1,
  ).length;
  const shiftSeries = result.flatMap((day) => [
    {
      id: `${year}-${monthStr}-${String(day.day).padStart(2, '0')}-day`,
      day: String(day.day).padStart(2, '0'),
      shiftType: 'day' as const,
      label: `${monthStr}.${String(day.day).padStart(2, '0')} DS`,
      plannedAmount: day.dayShift.plannedAmount,
      production: day.dayShift.production,
      coalProduction: day.dayShift.coalProduction,
      trips: day.dayShift.trips,
      coalTrips: day.dayShift.coalTrips,
      performanceRatio: day.dayShift.performanceRatio,
      comment: day.dayShift.comment,
    },
    {
      id: `${year}-${monthStr}-${String(day.day).padStart(2, '0')}-night`,
      day: String(day.day).padStart(2, '0'),
      shiftType: 'night' as const,
      label: `${monthStr}.${String(day.day).padStart(2, '0')} NS`,
      plannedAmount: day.nightShift.plannedAmount,
      production: day.nightShift.production,
      coalProduction: day.nightShift.coalProduction,
      trips: day.nightShift.trips,
      coalTrips: day.nightShift.coalTrips,
      performanceRatio: day.nightShift.performanceRatio,
      comment: day.nightShift.comment,
    },
  ]);

  return {
    year,
    month,
    dailyBreakdown: result,
    summary: {
      daysInMonth,
      elapsedDays,
      monthlyShiftPlanCount,
      elapsedShiftPlanCount,
      daysMetPlan,
      daysMissedPlan,
      monthlyPlanTotalProduction,
      cumulativePlanToDate,
      monthlyPlanFulfillmentRatio,
      cumulativePlanFulfillmentRatio,
    },
    shiftSeries,
    monthlyTotals: {
      totalTrips: Number(monthlyTotals.totalTrips) || 0,
      totalProduction: Number(monthlyTotals.totalProduction) || 0,
      totalPlannedAmount: Number(monthlyTotals.totalPlannedAmount) || 0,
      totalCoalTrips: Number(monthlyTotals.totalCoalTrips) || 0,
      totalCoalProduction: Number(monthlyTotals.totalCoalProduction) || 0,
      totalSoilProduction: Number(monthlyTotals.totalSoilProduction) || 0,
      overallPerformanceRatio:
        resolvedMonthlyPlanTotal > 0
          ? Number((monthlyTotals.totalProduction / resolvedMonthlyPlanTotal).toFixed(4))
          : 0,
    },
  };
};
