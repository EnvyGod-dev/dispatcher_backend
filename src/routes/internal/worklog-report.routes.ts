import {
  getWorkLogsByExcavator,
  getWorkLogsByExcavatorCount,
} from '$/context/work-log/reports/queries';
import { enumShiftType } from '$/libs/database/schema';
import { SORTABLE_COLUMNS_ZOD } from '$/context/shift/types';
import { rbac } from '$/middlewares/rbac.middleware';
import type { AppEnv } from '$/utils/app-env';
import { Forbidden } from '$/utils/errors';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { DATE_ONLY_PATTERN } from '$/utils/operational-date';

const worklogReportRoutes = new Hono<AppEnv>().get(
  '/worklog-report',
  rbac({ roles: ['admin', 'dispatcher', 'ita'] }),
  zValidator(
    'query',
    z.object({
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().optional(),
      status: z.enum(['started', 'completed', 'cancelled']).optional(),
      shiftType: z.enum(enumShiftType.enumValues).optional(),
      operationalDate: z.string().regex(DATE_ONLY_PATTERN).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      driverId: z.string().uuid().optional(),
      driverName: z.string().optional(),
      vehicleCode: z.string().optional(),
      miningBlockId: z.string().optional(),
      stockpileId: z.string().optional(),
      vehicleId: z.string().uuid().optional(),
      sortColumn: z.enum(SORTABLE_COLUMNS_ZOD).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    })
  ),
  async (c) => {
    const {
      limit,
      offset,
      status,
      shiftType,
      operationalDate,
      startDate,
      endDate,
      driverId,
      driverName,
      vehicleCode,
      miningBlockId,
      stockpileId,
      vehicleId,
    } = c.req.valid('query');

    const currentUser = c.get('currentUser');

    if (!currentUser.organizationId) {
      throw new Forbidden();
    }

    const data = await getWorkLogsByExcavator(
      {
        vehicleId,
        driverId,
        driverName,
        vehicleCode,
        status,
        stockpileId,
        miningBlockId,
        organizationId: currentUser.organizationId,
        operationalDate,
        startDate,
        endDate,
        shiftType,
      },
      { limit, offset }
    );

    const totalCount = await getWorkLogsByExcavatorCount({
      vehicleId,
      driverId,
      driverName,
      vehicleCode,
      status,
      stockpileId,
      miningBlockId,
      organizationId: currentUser.organizationId,
      operationalDate,
      startDate,
      endDate,
      shiftType,
    });

    return c.json(data, {
      headers: {
        'X-Total-Count': totalCount,
      },
    });
  }
);

export default worklogReportRoutes;
