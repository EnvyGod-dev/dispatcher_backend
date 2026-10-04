import { drizzleDb } from '$/libs/database/db';
import {
  dailyPlans,
  markshaderDailyReports,
  shifts,
  stockpiles,
  users,
  vehicles,
  workLogs,
} from '$/libs/database/schema';
import { first, firstOrNull, type PaginationType } from '$/libs/database/utils';
import {
  and,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  sql,
  sum,
} from 'drizzle-orm';

export type MarkshaderInput = typeof markshaderDailyReports.$inferInsert;

const MARKSHADER_STOCKPILE_TYPES = [
  'engineering',
  'common',
  'internal',
  'unproductive',
  'blast',
  'humus',
] as const;

export const getMarkshaderReports = async (
  { limit, offset }: PaginationType,
  {
    organizationId,
    startDate,
    endDate,
  }: { organizationId: string; startDate?: string; endDate?: string }
) => {
  const operator = drizzleDb.select({
    id: users.id,
    name: users.name,
  }).from(users).as('operator');

  const master = drizzleDb.select({
    id: users.id,
    name: users.name,
  }).from(users).as('master');

  return drizzleDb
    .select({
      ...getTableColumns(markshaderDailyReports),
      vehicle: {
        id: vehicles.id,
        name: vehicles.name,
        mineNumber: vehicles.mineNumber,
      },
      operatorName: operator.name,
      masterName: master.name,
      totalCount: sql<number>`count(*) OVER()`.as('total_count'),
    })
    .from(markshaderDailyReports)
    .leftJoin(vehicles, eq(markshaderDailyReports.vehicleId, vehicles.id))
    .leftJoin(operator, eq(markshaderDailyReports.operatorId, operator.id))
    .leftJoin(master, eq(markshaderDailyReports.masterId, master.id))
    .where(
      and(
        eq(markshaderDailyReports.organizationId, organizationId),
        startDate
          ? gte(markshaderDailyReports.reportDate, startDate)
          : undefined,
        endDate
          ? lt(markshaderDailyReports.reportDate, endDate)
          : undefined
      )
    )
    .limit(limit)
    .offset(offset)
    .orderBy(desc(markshaderDailyReports.reportDate));
};

export const createMarkshaderReport = async (input: MarkshaderInput) => {
  return first(
    await drizzleDb.insert(markshaderDailyReports).values(input).returning()
  );
};

export const updateMarkshaderReport = async (
  id: string,
  input: Partial<MarkshaderInput>
) => {
  return first(
    await drizzleDb
      .update(markshaderDailyReports)
      .set({ ...input })
      .where(eq(markshaderDailyReports.id, id))
      .returning()
  );
};

export const getMarkshaderReportById = async (
  id: string,
  organizationId: string
) => {
  return firstOrNull(
    await drizzleDb
      .select()
      .from(markshaderDailyReports)
      .where(
        and(
          eq(markshaderDailyReports.id, id),
          eq(markshaderDailyReports.organizationId, organizationId)
        )
      )
  );
};

export const deleteMarkShaderReport = async (
  id: string,
  organizationId: string
) => {
  return first(
    await drizzleDb
      .delete(markshaderDailyReports)
      .where(
        and(
          eq(markshaderDailyReports.id, id),
          eq(markshaderDailyReports.organizationId, organizationId)
        )
      )
      .returning()
  );
};

export const getMarkshaderStats = async ({
  organizationId,
  startDate,
  endDate,
}: {
  organizationId: string;
  startDate?: string;
  endDate?: string;
}) => {
  const conditions = [
    eq(markshaderDailyReports.organizationId, organizationId),
  ];

  if (startDate) {
    conditions.push(gte(markshaderDailyReports.reportDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(markshaderDailyReports.reportDate, endDate));
  }

  return first(
    await drizzleDb
      .select({
        totalMarkProduction: sql<number>`SUM(CAST(${markshaderDailyReports.markProduction} AS NUMERIC))`,
        totalDisSoil: sql<number>`SUM(CAST(${markshaderDailyReports.disSoil} AS NUMERIC))`,
        totalDisCoal: sql<number>`SUM(CAST(${markshaderDailyReports.disCoal} AS NUMERIC))`,
        totalDisReisSoil: sql<number>`SUM(${markshaderDailyReports.disReisSoil})`,
        totalDisReisCoal: sql<number>`SUM(${markshaderDailyReports.disReisCoal})`,
        totalDisProduction: sql<number>`SUM(CAST(${markshaderDailyReports.disTotalProduction} AS NUMERIC))`,
        avgDiscrepancy: sql<number>`AVG(CAST(${markshaderDailyReports.markDisDiscrepancy} AS NUMERIC))`,
        reportCount: sql<number>`COUNT(*)`,
      })
      .from(markshaderDailyReports)
      .where(and(...conditions))
  );
};

export const getActualProductionByVehicleAndDate = async (
  date: string,
  organizationId: string,
  vehicleId: string
) => {
  const result = await drizzleDb.execute(sql`
    SELECT
      COALESCE(SUM(
        CASE
          WHEN sp.type = 'coal'
          THEN COALESCE(truck.coal_coefficient::numeric, 0)
          ELSE 0
        END
      ), 0)::float AS dis_coal,

      COALESCE(SUM(
        CASE
          WHEN sp.type != 'coal' OR sp.type IS NULL
          THEN COALESCE(truck.soil_coefficient::numeric, 0)
          ELSE 0
        END
      ), 0)::float AS dis_soil,

      COUNT(CASE WHEN sp.type = 'coal' THEN wl.id END)::int AS dis_reis_coal,
      COUNT(CASE WHEN sp.type != 'coal' OR sp.type IS NULL THEN wl.id END)::int AS dis_reis_soil

    FROM daily_plans dp
    JOIN work_logs wl
      ON wl.plan_id = dp.id
     AND wl.status != 'cancelled'

    JOIN shifts sh
      ON sh.id = wl.shift_id
     AND sh.shift_status != 'cancelled'

    JOIN vehicles truck
      ON truck.id = sh.vehicle_id
     AND truck.deleted_at IS NULL

    LEFT JOIN stockpiles sp
      ON sp.id = wl.stockpile_id

    WHERE dp.organization_id = ${organizationId}
      AND dp.vehicle_id = ${vehicleId}
      AND dp.date = ${date}::date
  `);

  const row = result.rows[0] as {
    dis_soil: number;
    dis_coal: number;
    dis_reis_soil: number;
    dis_reis_coal: number;
  } | undefined;

  const disSoil = Number(row?.dis_soil ?? 0);
  const disCoal = Number(row?.dis_coal ?? 0);
  const disTotalProduction = disSoil + disCoal;

  return {
    disSoil,
    disCoal,
    disTotalProduction,
    disReisSoil: Number(row?.dis_reis_soil ?? 0),
    disReisCoal: Number(row?.dis_reis_coal ?? 0),
    disCoefficient:
      disTotalProduction > 0
        ? Number((disTotalProduction / Math.max(1, Number(row?.dis_reis_soil ?? 0) + Number(row?.dis_reis_coal ?? 0))).toFixed(4))
        : 0,
  };
};


export const getExcavatorsByDate = async (
  date: string,
  organizationId: string
) => {
  return drizzleDb
    .selectDistinct({
      vehicleId: vehicles.id,
      vehicleName: vehicles.name,
      mineNumber: vehicles.mineNumber,
    })
    .from(dailyPlans)
    .innerJoin(
      vehicles,
      and(
        eq(dailyPlans.vehicleId, vehicles.id),
        isNull(vehicles.deletedAt),
        eq(vehicles.type, 'excavator')
      )
    )
    .where(
      and(
        eq(dailyPlans.organizationId, organizationId),
        eq(dailyPlans.date, date)
      )
    )
    .orderBy(vehicles.mineNumber);
};
