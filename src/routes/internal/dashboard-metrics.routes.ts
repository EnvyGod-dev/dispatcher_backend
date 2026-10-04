import {
  getDateRanges,
  getDriverStatus,
  getMonthlyTarget,
  getProductComparisons,
  getRecentShifts,
  getTodaysProduct,
  getYearlyStats,
} from '$/context/dashboard-metrics';
import type { AppEnv } from '$/utils/app-env';
import { Forbidden } from '$/utils/errors';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

const dashboardMetricsRoute = new Hono<AppEnv>();

dashboardMetricsRoute.get(
  '/dashboard-metrics',
  zValidator(
    'query',
    z.object({
      period: z.enum(['monthly', 'quarterly', 'annually']).default('monthly'),
      year: z.coerce
        .number()
        .min(2020)
        .max(2030)
        .default(new Date().getFullYear()),
      month: z.coerce.number().min(1).max(12).optional(),
      quarter: z.coerce.number().min(1).max(4).optional(),
    })
  ),
  async (c) => {
    const query = c.req.valid('query');
    const user = c.get('currentUser');

    if (!user || !user.organizationId) {
      throw new Forbidden();
    }

    // 1. DRIVER STATISTICS
    const driverStats = await getDriverStatus({
      organizationId: user.organizationId,
    });

    // 2. TONNAGE COMPARISON (Current vs Previous Period)
    const productionComparisons = await getProductComparisons({
      organizationId: user.organizationId,
      year: query.year,
      month: query.month,
      quarter: query.quarter,
    });

    // 3. MONTHLY TARGET vs CURRENT (from daily plans)
    const monthlyTarget = await getMonthlyTarget({
      organizationId: user.organizationId,
      year: query.year,
      month: query.month,
      quarter: query.quarter,
    });

    const todaysProgress = await getTodaysProduct({
      organizationId: user.organizationId,
    });

    // 4. YEARLY STATISTICS (Planned vs Actual by Month)
    const yearlyStats = await getYearlyStats({
      organizationId: user.organizationId,
      year: query.year,
    });

    const recentShifts = await getRecentShifts({
      organizationId: user.organizationId,
    });

    const { startDate, endDate } = getDateRanges(
      query.year,
      query.month ?? new Date().getMonth() + 1,
      query.quarter ?? Math.ceil((new Date().getMonth() + 1) / 3)
    );

    return c.json({
      drivers: {
        total: driverStats?.totalDrivers || 0,
        active: driverStats?.activeDrivers || 0,
        inactive: driverStats?.inactiveDrivers || 0,
      },
      products: {
        current: {
          coal: productionComparisons.current.coal,
          soil: productionComparisons.current.soil,
          total: productionComparisons.current.total,
        },
        previous: {
          coal: productionComparisons.previous.coal,
          soil: productionComparisons.previous.soil,
          total: productionComparisons.previous.total,
        },
        changes: {
          coal: productionComparisons.changes.coal,
          soil: productionComparisons.changes.soil,
          total: productionComparisons.changes.total,
        },
        isCoalIncreased: productionComparisons.changes.coal >= 0,
        isSoilIncreased: productionComparisons.changes.soil >= 0,
        isTotalIncreased: productionComparisons.changes.total >= 0,
      },
      targets: {
        coal: monthlyTarget.targetCoal,
        soil: monthlyTarget.targetSoil,
        current: {
          coal: productionComparisons.current.coal,
          soil: productionComparisons.current.soil,
          total: productionComparisons.current.total,
        },
        today: {
          coal: todaysProgress.todaysCoal,
          soil: todaysProgress.todaysSoil,
        },
        progress: {
          coal:
            monthlyTarget.targetCoal > 0
              ? Math.round(
                  (productionComparisons.current.coal /
                    monthlyTarget.targetCoal) *
                    100
                )
              : 0,
          soil:
            monthlyTarget.targetSoil > 0
              ? Math.round(
                  (productionComparisons.current.soil /
                    monthlyTarget.targetSoil) *
                    100
                )
              : 0,
        },
      },
      yearlyStatistics: yearlyStats,
      recentShifts: recentShifts.map((shift) => ({
        id: shift.id,
        driverName:
          shift.driverName ||
          `${shift.driverFirstName || ''} ${
            shift.driverLastName || ''
          }`.trim() ||
          'N/A',
        vehicleName: shift.vehicleName || 'N/A',
        vehicleNumber: shift.vehicleNumber || 'N/A',
        shiftStart: shift.shiftStart,
        shiftEnd: shift.shiftEnd,
        status: shift.status,
        shiftType: shift.shiftType,
      })),
      period: {
        type: query.period,
        year: query.year,
        month: query.month,
        quarter: query.quarter,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  }
);

export default dashboardMetricsRoute;
