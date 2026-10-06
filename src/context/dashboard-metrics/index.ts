import { drizzleDb } from '$/libs/database/db';
import {
  dailyPlans,
  shifts,
  stockpiles,
  users,
  vehicles,
} from '$/libs/database/schema';
import { firstOrNull } from '$/libs/database/utils';
import worklogRoutes from '$/routes/internal/worklog.routes';
import { resolveLegacyOperationalDate } from '$/utils/operational-date';
import Big from 'big.js';
import { and, count, desc, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm';

export const getDriverStatus = async ({
  organizationId,
}: {
  organizationId: string;
}) => {
  return firstOrNull(
    await drizzleDb
      .select({
        totalDrivers: count(),
        activeDrivers: sql<number>`SUM(CASE WHEN ${users.status} IN ('available') THEN 1 ELSE 0 END)`,
        inactiveDrivers: sql<number>`SUM(CASE WHEN ${users.status} NOT IN ('available') THEN 1 ELSE 0 END)`,
      })
      .from(users)
      .where(
        and(
          eq(users.role, 'driver'),
          eq(users.organizationId, organizationId),
          ne(users.status, 'inactive')
        )
      )
  );
};

export const getProductComparisons = async ({
  organizationId,
  month,
  quarter,
  year,
}: {
  organizationId: string;
  year: number;
  month?: number;
  quarter?: number;
}) => {
  const { startDate, endDate, prevStartDate, prevEndDate } = getDateRanges(
    year,
    month,
    quarter
  );

  // Current period - separate coal and soil
  const currentProductions = await drizzleDb
    .select({
      totalCoalTonnage: sql<number>`SUM(COALESCE(CAST(${shifts.coalProduct} AS DECIMAL), 0))`,
      totalSoilTonnage: sql<number>`SUM(COALESCE(CAST(${shifts.soilProduct} AS DECIMAL), 0))`,
    })
    .from(shifts)
    .leftJoin(users, eq(shifts.driverId, users.id))
    .where(
      and(
        eq(shifts.status, 'completed'),
        gte(shifts.shiftEnd, startDate.toISOString()),
        lte(shifts.shiftEnd, endDate.toISOString()),
        eq(shifts.organizationId, organizationId)
      )
    );

  // Previous period - separate coal and soil
  const previousProductions = await drizzleDb
    .select({
      totalCoalTonnage: sql<number>`SUM(COALESCE(CAST(${shifts.coalProduct} AS DECIMAL), 0))`,
      totalSoilTonnage: sql<number>`SUM(COALESCE(CAST(${shifts.soilProduct} AS DECIMAL), 0))`,
    })
    .from(shifts)
    .leftJoin(users, eq(shifts.driverId, users.id))
    .where(
      and(
        eq(shifts.status, 'completed'),
        gte(shifts.shiftEnd, prevStartDate.toISOString()),
        lte(shifts.shiftEnd, prevEndDate.toISOString()),
        eq(shifts.organizationId, organizationId)
      )
    );

  // Safe extraction with defaults
  const currentCoal = Big(currentProductions[0]?.totalCoalTonnage ?? 0);
  const currentSoil = Big(currentProductions[0]?.totalSoilTonnage ?? 0);
  const previousCoal = Big(previousProductions[0]?.totalCoalTonnage ?? 0);
  const previousSoil = Big(previousProductions[0]?.totalSoilTonnage ?? 0);

  // Calculate comparison percentages
  const coalProductChange = previousCoal.gt(0)
    ? currentCoal.minus(previousCoal).div(previousCoal).mul(100).toNumber()
    : 0;

  const soilProductChange = previousSoil.gt(0)
    ? currentSoil.minus(previousSoil).div(previousSoil).mul(100).toNumber()
    : 0;

  return {
    current: {
      coal: currentCoal.toNumber(),
      soil: currentSoil.toNumber(),
      total: currentCoal.plus(currentSoil).toNumber(),
    },
    previous: {
      coal: previousCoal.toNumber(),
      soil: previousSoil.toNumber(),
      total: previousCoal.plus(previousSoil).toNumber(),
    },
    changes: {
      coal: coalProductChange,
      soil: soilProductChange,
      total: previousCoal.plus(previousSoil).gt(0)
        ? currentCoal
            .plus(currentSoil)
            .minus(previousCoal.plus(previousSoil))
            .div(previousCoal.plus(previousSoil))
            .mul(100)
            .toNumber()
        : 0,
    },
  };
};

export const getMonthlyTarget = async ({
  organizationId,
  month,
  quarter,
  year,
}: {
  organizationId: string;
  year: number;
  month?: number;
  quarter?: number;
}) => {
  const { startDate, endDate } = getDateRanges(year, month, quarter);

  const monthlyTarget = await drizzleDb
    .select({
      targetCoalProduct: sql<number>`
      SUM(
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM ${stockpiles} s 
            WHERE s.id = ANY(${dailyPlans.stockpileIds}) 
            AND s.type = 'coal'
          )
          THEN COALESCE(CAST(${dailyPlans.transportAmount} AS DECIMAL), 0)
          ELSE 0 
        END
      )
    `,
      targetSoilProduct: sql<number>`
      SUM(
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM ${stockpiles} s 
            WHERE s.id = ANY(${dailyPlans.stockpileIds}) 
            AND s.type = 'soil'
          )
          THEN COALESCE(CAST(${dailyPlans.transportAmount} AS DECIMAL), 0)
          ELSE 0 
        END
      )
    `,
    })
    .from(dailyPlans)
    .where(
      and(
        gte(sql`DATE(${dailyPlans.date})`, startDate.toISOString()),
        lte(sql`DATE(${dailyPlans.date})`, endDate.toISOString()),
        eq(dailyPlans.organizationId, organizationId)
      )
    );

  const targetCoal = Big(monthlyTarget[0]?.targetCoalProduct ?? 0).toNumber();
  const targetSoil = Big(monthlyTarget[0]?.targetSoilProduct ?? 0).toNumber();

  return {
    targetCoal,
    targetSoil,
  };
};

export const getTodaysProduct = async ({
  organizationId,
}: {
  organizationId: string;
}) => {
  const todaysProgress = await drizzleDb
    .select({
      todayCoalProduct: sql<number>`SUM(COALESCE(CAST(${shifts.coalProduct} AS DECIMAL), 0))`,
      todaySoilProduct: sql<number>`SUM(COALESCE(CAST(${shifts.soilProduct} AS DECIMAL), 0))`,
    })
    .from(shifts)
    .where(
      and(
        eq(shifts.status, 'completed'),
        // Одоогийн ажлын өдөр (Улаанбаатарын цагаар; 06:30-аас өмнө бол өмнөх өдрийн шөнийн ээлж).
        sql`COALESCE(${shifts.operationalDate}, (${shifts.createdAt} AT TIME ZONE 'Asia/Ulaanbaatar')::date) = ${resolveLegacyOperationalDate({ shiftType: 'night' })}`,
        eq(shifts.organizationId, organizationId)
      )
    );

  const todaysCoal = Big(todaysProgress[0]?.todayCoalProduct ?? 0).toNumber();
  const todaysSoil = Big(todaysProgress[0]?.todaySoilProduct ?? 0).toNumber();

  return {
    todaysCoal,
    todaysSoil,
  };
};
export const getYearlyStats = async ({
  organizationId,
  year,
}: {
  organizationId: string;
  year: number;
}) => {
  const yearlyStats = await drizzleDb
    .select({
      month: sql<number>`EXTRACT(MONTH FROM ${dailyPlans.createdAt})`,
      plannedCoalProduct: sql<number>`
      SUM(
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM ${stockpiles} s 
            WHERE s.id = ANY(${dailyPlans.stockpileIds}) 
            AND s.type = 'coal'
          )
          THEN COALESCE(CAST(${dailyPlans.transportAmount} AS DECIMAL), 0)
          ELSE 0 
        END
      )
    `,
      plannedSoilProduct: sql<number>`
      SUM(
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM ${stockpiles} s 
            WHERE s.id = ANY(${dailyPlans.stockpileIds}) 
            AND s.type = 'soil'
          )
          THEN COALESCE(CAST(${dailyPlans.transportAmount} AS DECIMAL), 0)
          ELSE 0 
        END
      )
    `,
    })
    .from(dailyPlans)
    .where(
      and(
        gte(dailyPlans.createdAt, new Date(year, 0, 1).toISOString()),
        lte(
          dailyPlans.createdAt,
          new Date(year, 11, 31, 23, 59, 59, 999).toISOString()
        ),
        eq(dailyPlans.organizationId, organizationId)
      )
    )
    .groupBy(sql`EXTRACT(MONTH FROM ${dailyPlans.createdAt})`);

  const yearlyActual = await drizzleDb
    .select({
      month: sql<number>`EXTRACT(MONTH FROM ${shifts.shiftEnd})`,
      actualCoalProduct: sql<number>`SUM(COALESCE(CAST(${shifts.coalProduct} AS DECIMAL), 0))`,
      actualSoilProduct: sql<number>`SUM(COALESCE(CAST(${shifts.soilProduct} AS DECIMAL), 0))`,
    })
    .from(shifts)
    .where(
      and(
        eq(shifts.status, 'completed'),
        gte(shifts.shiftEnd, new Date(year, 0, 1).toISOString()),
        lte(
          shifts.shiftEnd,
          new Date(year, 11, 31, 23, 59, 59, 999).toISOString()
        ),
        eq(shifts.organizationId, organizationId)
      )
    )
    .groupBy(sql`EXTRACT(MONTH FROM ${shifts.shiftEnd})`);

  // Create a map for easy lookup - Convert month to number
  const actualMap = new Map(
    yearlyActual.map((row) => [
      Number(row.month), // Convert to number
      {
        coal: Big(row.actualCoalProduct ?? 0),
        soil: Big(row.actualSoilProduct ?? 0),
      },
    ])
  );

  const plannedMap = new Map(
    yearlyStats.map((row) => [
      Number(row.month), // Convert to number
      {
        coal: Big(row.plannedCoalProduct ?? 0),
        soil: Big(row.plannedSoilProduct ?? 0),
      },
    ])
  );

  // Generate data for all 12 months
  const monthlyData = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const actual = actualMap.get(month) || { coal: Big(0), soil: Big(0) };
    const planned = plannedMap.get(month) || { coal: Big(0), soil: Big(0) };

    const actualTotal = actual.coal.plus(actual.soil);
    const plannedTotal = planned.coal.plus(planned.soil);

    return {
      month,
      actual: {
        coal: actual.coal.toNumber(),
        soil: actual.soil.toNumber(),
        total: actualTotal.toNumber(),
      },
      planned: {
        coal: planned.coal.toNumber(),
        soil: planned.soil.toNumber(),
        total: plannedTotal.toNumber(),
      },
      achievement: {
        coal: planned.coal.gt(0)
          ? actual.coal.div(planned.coal).mul(100).toNumber()
          : 0,
        soil: planned.soil.gt(0)
          ? actual.soil.div(planned.soil).mul(100).toNumber()
          : 0,
        total: plannedTotal.gt(0)
          ? actualTotal.div(plannedTotal).mul(100).toNumber()
          : 0,
      },
    };
  });

  return monthlyData;
};

export const getRecentShifts = async ({
  organizationId,
}: {
  organizationId: string;
}) => {
  return drizzleDb
    .select({
      id: shifts.id,
      driverName: users.name,
      driverFirstName: users.firstName,
      driverLastName: users.lastName,
      vehicleName: vehicles.name,
      vehicleNumber: vehicles.vehicleNumber,
      shiftStart: shifts.shiftStart,
      shiftEnd: shifts.shiftEnd,
      status: shifts.status,
      shiftType: shifts.shiftType,
    })
    .from(shifts)
    .leftJoin(users, eq(shifts.driverId, users.id))
    .leftJoin(vehicles, and(eq(shifts.vehicleId, vehicles.id), isNull(vehicles.deletedAt)))
    .where(and(eq(shifts.organizationId, organizationId), isNull(vehicles.deletedAt)))
    .orderBy(desc(shifts.shiftStart))
    .limit(5);
};

export const getDateRanges = (
  year: number,
  month?: number,
  quarter?: number
) => {
  const currentDate = new Date();
  let startDate: Date, endDate: Date, prevStartDate: Date, prevEndDate: Date;

  if (month) {
    // Monthly
    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0, 23, 59, 59, 999);
    prevStartDate = new Date(year, month - 2, 1);
    prevEndDate = new Date(year, month - 1, 0, 23, 59, 59, 999);
  } else if (quarter) {
    // Quarterly
    const quarterStart = (quarter - 1) * 3;
    startDate = new Date(year, quarterStart, 1);
    endDate = new Date(year, quarterStart + 3, 0, 23, 59, 59, 999);
    prevStartDate = new Date(year, quarterStart - 3, 1);
    prevEndDate = new Date(year, quarterStart, 0, 23, 59, 59, 999);
  } else {
    // Annually
    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31, 23, 59, 59, 999);
    prevStartDate = new Date(year - 1, 0, 1);
    prevEndDate = new Date(year - 1, 11, 31, 23, 59, 59, 999);
  }

  return { startDate, endDate, prevStartDate, prevEndDate };
};
