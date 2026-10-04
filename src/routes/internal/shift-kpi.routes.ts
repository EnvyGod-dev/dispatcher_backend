import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  getTopExca,
  getMostActiveDump,
  getMostActiveOperators,
  getTodayInspections,
} from '$/context/shift/kpi';
import type { AppEnv } from '$/utils/app-env';
import { Forbidden } from '$/utils/errors';
import { DATE_ONLY_PATTERN } from '$/utils/operational-date';

const app = new Hono<AppEnv>();

const shiftKpiFilterSchema = z.object({
  status: z.enum(['started', 'completed', 'cancelled']).optional(),
  shiftType: z.enum(['day', 'night']).optional(),
  operationalDate: z.string().regex(DATE_ONLY_PATTERN).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  driverId: z.string().uuid().optional(),
  driverName: z.string().optional(),
  vehicleId: z.string().uuid().optional(),
  vehicleCode: z.string().optional(),
  miningBlockId: z.string().optional(),
  stockpileId: z.string().optional(),
});

// get top performing excavator
app.get('/top-exca', zValidator('query', shiftKpiFilterSchema), async (c) => {
  const query = c.req.valid('query');

  const currentUser = c.get('currentUser');

  if (!currentUser.organizationId) {
    throw new Forbidden();
  }

  const result = await getTopExca({
    ...query,
    organizationId: currentUser.organizationId,
  });

  return c.json(result);
});

// get most active dump truck
app.get(
  '/most-active-dump',
  zValidator('query', shiftKpiFilterSchema),
  async (c) => {
    const query = c.req.valid('query');

    const currentUser = c.get('currentUser');

    if (!currentUser.organizationId) {
      throw new Forbidden();
    }

    const result = await getMostActiveDump({
      ...query,
      organizationId: currentUser.organizationId,
    });

    return c.json(result);
  }
);

app.get(
  '/most-active-operators',
  zValidator('query', shiftKpiFilterSchema),
  async (c) => {
    const query = c.req.valid('query');

    const currentUser = c.get('currentUser');

    if (!currentUser.organizationId) {
      throw new Forbidden();
    }

    const result = await getMostActiveOperators({
      ...query,
      organizationId: currentUser.organizationId,
    });

    return c.json(result);
  }
);

app.get('/today-inspections', zValidator('query', shiftKpiFilterSchema), async (c) => {
  const query = c.req.valid('query');
  const currentUser = c.get('currentUser');

  if (!currentUser.organizationId) {
    throw new Forbidden();
  }

  const result = await getTodayInspections({
    ...query,
    organizationId: currentUser.organizationId,
  });

  return c.json(result);
});

export default app;
