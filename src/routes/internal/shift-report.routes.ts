import { getMonthlyPlanByMonth, getMonthlyPlans } from '$/context/monthly-plan';
import { getTopExca } from '$/context/shift/kpi';
import {
  getShiftInspectionReports,
  getShiftCount,
  getShiftDetails,
  getShiftKpi,
  getShiftReports,
  getMonthlyAggregationReport,
} from '$/context/shift/report';
import { upsertShiftReportComment } from '$/context/shift-report-comment';
import { SORTABLE_COLUMNS_ZOD } from '$/context/shift/types';
import { rbac } from '$/middlewares/rbac.middleware';
import type { AppEnv } from '$/utils/app-env';
import { Forbidden } from '$/utils/errors';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { DATE_ONLY_PATTERN } from '$/utils/operational-date';
import { enumVehicleType } from '$/libs/database/schema';

const shiftsReportRouter = new Hono<AppEnv>();
shiftsReportRouter

  .get('/top-excavator', async (c) => {
    const currentUser = c.get('currentUser');

    if (!currentUser.organizationId) {
      throw new Forbidden();
    }

    const data = await getTopExca({
      organizationId: currentUser.organizationId,
    });

    return c.json(data);
  })
  .get(
    '/shifts-insights',
      zValidator(
        'query',
        z.object({
          status: z.enum(['started', 'completed', 'cancelled']).optional(),
          shiftType: z.enum(['day', 'night']).optional(),
          operationalDate: z.string().regex(DATE_ONLY_PATTERN).optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          driverId: z.string().uuid().optional(),
          driverName: z.string().optional(),
          vehicleId: z.string().uuid().optional(),
          vehicleOrganizationId: z.string().uuid().optional(),
          vehicleCode: z.string().optional(),
          miningBlockId: z.string().optional(),
          stockpileId: z.string().optional(),
        })
      ),
    async (c) => {
      const query = c.req.valid('query');
      const user = c.get('currentUser');

      // Ensure user has permission (admin or superadmin)
      if (!['admin', 'superadmin', 'dispatcher'].includes(user.role)) {
        return c.json({ error: 'Unauthorized' }, 403);
      }

      if (!user.organizationId) {
        throw new Forbidden();
      }

      const result = await getShiftKpi({
        ...query,
        organizationId: user.organizationId,
      });

      return c.json(result);
    }
  )
  .get(
    '/shifts-report/inspection-view',
    zValidator(
      'query',
      z.object({
        operationalDate: z.string().regex(DATE_ONLY_PATTERN).optional(),
        shiftType: z.enum(['day', 'night']).optional(),
        driverId: z.string().uuid().optional(),
        vehicleId: z.string().uuid().optional(),
        vehicleOrganizationId: z.string().uuid().optional(),
        vehicleType: z.enum(enumVehicleType.enumValues).optional(),
        inspectionState: z
          .enum(['all', 'done', 'not_done', 'has_issue'])
          .optional()
          .default('all'),
        limit: z.coerce.number().min(1).optional(),
        offset: z.coerce.number().min(0).default(0),
      }),
    ),
    async (c) => {
      const query = c.req.valid('query');
      const user = c.get('currentUser');

      if (user.organizationId === null) {
        throw new Forbidden();
      }

      const report = await getShiftInspectionReports(
        {
          limit: query.limit,
          offset: query.offset,
        },
        {
          ...query,
          organizationId: user.organizationId,
        },
      );

      return c.json(report.data, {
        headers: {
          'X-Total-Count': report.totalCount,
        },
      });
    },
  )
  .get(
    '/shifts-report',
    zValidator(
      'query',
      z.object({
        status: z.enum(['started', 'completed', 'cancelled']).optional(),
        shiftType: z.enum(['day', 'night']).optional(),
        operationalDate: z.string().regex(DATE_ONLY_PATTERN).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        driverId: z.string().uuid().optional(),
        driverName: z.string().optional(),
        vehicleCode: z.string().optional(),
        miningBlockId: z.string().optional(),
        stockpileId: z.string().optional(),
        vehicleId: z.string().uuid().optional(),
        vehicleOrganizationId: z.string().uuid().optional(),
        limit: z.coerce.number().min(1).optional(),
        offset: z.coerce.number().min(0).default(0),
        sortColumn: z
          .enum(SORTABLE_COLUMNS_ZOD)
          .optional()
          .default('createdAt'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
      })
    ),
    async (c) => {
      const query = c.req.valid('query');

      const user = c.get('currentUser');

      if (user.organizationId === null) {
        throw new Forbidden();
      }

      const report = await getShiftReports(
        {
          limit: query.limit,
          offset: query.offset,
        },
        {
          ...query,
          organizationId: user.organizationId,
        }
      );

      return c.json(report.data, {
        headers: {
          'X-Total-Count': report.totalCount,
        },
      });
    }
  )
  .get(
    '/shift-details',
    rbac({ roles: ['ita', 'admin', 'dispatcher'] }),
    zValidator(
      'query',
      z.object({
        shiftId: z.string().uuid(),
      })
    ),
    async (c) => {
      const { shiftId } = c.req.valid('query');

      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new Forbidden();
      }

      const details = await getShiftDetails({
        shiftId,
        organizationId: user.organizationId,
      });

      return c.json(details);
    }
  )
  .get(
    '/monthly-aggregation',
    zValidator(
      'query',
      z.object({
        year: z.coerce.number().min(2020).max(2050),
        month: z.coerce.number().min(1).max(12),
      })
    ),
    async (c) => {
      const { year, month } = c.req.valid('query');
      const user = c.get('currentUser');

      if (!['admin', 'superadmin', 'dispatcher'].includes(user.role)) {
        return c.json({ error: 'Unauthorized' }, 403);
      }

      if (!user.organizationId) {
        throw new Forbidden();
      }

      const monthlyPlan = await getMonthlyPlanByMonth({
        organizationId: user.organizationId,
        year,
        month,
      });

      const monthlyPlanTotal =
        (Number(monthlyPlan?.coalAmount) || 0) +
        (Number(monthlyPlan?.soilAmount) || 0);

      const report = await getMonthlyAggregationReport({
        organizationId: user.organizationId,
        year,
        month,
        monthlyPlanTotal,
      });

      return c.json({ ...report, monthlyPlan });
    }
  )
  .put(
    '/shift-report/comment',
    zValidator(
      'json',
      z.object({
        date: z.string().regex(DATE_ONLY_PATTERN),
        shiftType: z.enum(['day', 'night']),
        comment: z.string().max(1000),
      })
    ),
    async (c) => {
      const { date, shiftType, comment } = c.req.valid('json');
      const user = c.get('currentUser');

      if (!['admin', 'superadmin', 'dispatcher'].includes(user.role)) {
        return c.json({ error: 'Unauthorized' }, 403);
      }

      if (!user.organizationId) {
        throw new Forbidden();
      }

      const result = await upsertShiftReportComment({
        organizationId: user.organizationId,
        date,
        shiftType,
        comment,
        createdBy: user.id,
      });

      return c.json(result);
    }
  );

export default shiftsReportRouter;
