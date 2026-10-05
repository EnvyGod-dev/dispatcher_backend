import {
  closeFuelAlert,
  evaluateFuelAlerts,
  getFuelAlerts,
  getFuelAuditLogs,
  getFuelConsumptionReport,
  getFuelConsumptionTimeseries,
  getFuelDashboardSummary,
  getFuelPeriodSummary,
  getFuelProductionStats,
  getFuelReceiptsBySupplier,
  getFuelRefuelBreakdown,
  runFuelDailyJob,
  syncFuelProductionFromStratum,
  upsertFuelProductionStat,
} from '$/context/fuel';
import { rbac } from '$/middlewares/rbac.middleware';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  FUEL_ROLES,
  alertCloseSchema,
  alertEvaluateSchema,
  alertsQuery,
  consumptionQuery,
  dateStr,
  idParam,
  notFoundIfNull,
  orgOf,
  productionStatSchema,
  rangeQuery,
  run,
  userOf,
  uuid,
} from './schemas';

export const fuelAnalyticsRoutes = new Hono<AppEnv>()
  .get(
    '/production',
    rbac({ roles: FUEL_ROLES.view }),
    zValidator('query', rangeQuery.extend({ vehicleId: uuid.optional() })),
    async (c) => {
      return c.json(await getFuelProductionStats(orgOf(c), c.req.valid('query')));
    },
  )
  .put('/production', rbac({ roles: FUEL_ROLES.engineer }), zValidator('json', productionStatSchema), async (c) => {
    return run(async () => {
      const stat = await upsertFuelProductionStat({
        ...c.req.valid('json'),
        organizationId: orgOf(c),
        source: 'manual',
        importedBy: userOf(c).id,
      });

      return c.json(stat);
    });
  })
  .post('/production/sync', rbac({ roles: FUEL_ROLES.engineer }), zValidator('json', rangeQuery), async (c) => {
    const { from, to } = c.req.valid('json');

    return run(async () => c.json(await syncFuelProductionFromStratum(orgOf(c), from, to)));
  })

  .get('/consumption', rbac({ roles: FUEL_ROLES.view }), zValidator('query', consumptionQuery), async (c) => {
    const { from, to, ...filter } = c.req.valid('query');

    return run(async () => c.json(await getFuelConsumptionReport(orgOf(c), from, to, filter)));
  })
  .get(
    '/consumption/:id/timeseries',
    rbac({ roles: FUEL_ROLES.view }),
    zValidator('param', idParam),
    zValidator('query', rangeQuery),
    async (c) => {
      const { from, to } = c.req.valid('query');

      return run(async () => c.json(await getFuelConsumptionTimeseries(orgOf(c), c.req.valid('param').id, from, to)));
    },
  )

  .get('/alerts', rbac({ roles: FUEL_ROLES.view }), zValidator('query', alertsQuery), async (c) => {
    const { status, ...filter } = c.req.valid('query');

    return c.json(await getFuelAlerts(orgOf(c), status, filter));
  })
  .post('/alerts/evaluate', rbac({ roles: FUEL_ROLES.engineer }), zValidator('json', alertEvaluateSchema), async (c) => {
    return run(async () => c.json(await evaluateFuelAlerts(orgOf(c), c.req.valid('json'))));
  })
  .post(
    '/alerts/:id/close',
    rbac({ roles: FUEL_ROLES.engineer }),
    zValidator('param', idParam),
    zValidator('json', alertCloseSchema),
    async (c) => {
      return run(async () => {
        const alert = await closeFuelAlert(orgOf(c), c.req.valid('param').id, userOf(c).id, c.req.valid('json').reason);

        return c.json(notFoundIfNull(alert, 'Alert олдсонгүй.'));
      });
    },
  )

  .get(
    '/reports/summary',
    rbac({ roles: FUEL_ROLES.view }),
    zValidator('query', rangeQuery.extend({ granularity: z.enum(['day', 'week', 'month']).default('day') })),
    async (c) => {
      const { from, to, granularity } = c.req.valid('query');

      return run(async () => c.json(await getFuelPeriodSummary(orgOf(c), from, to, granularity)));
    },
  )
  .get('/reports/receipts-by-supplier', rbac({ roles: FUEL_ROLES.view }), zValidator('query', rangeQuery), async (c) => {
    const { from, to } = c.req.valid('query');

    return run(async () => c.json(await getFuelReceiptsBySupplier(orgOf(c), from, to)));
  })
  .get('/reports/refuel-breakdown', rbac({ roles: FUEL_ROLES.view }), zValidator('query', rangeQuery), async (c) => {
    const { from, to } = c.req.valid('query');

    return run(async () => c.json(await getFuelRefuelBreakdown(orgOf(c), from, to)));
  })
  .get('/reports/dashboard', rbac({ roles: FUEL_ROLES.view }), zValidator('query', rangeQuery), async (c) => {
    const { from, to } = c.req.valid('query');

    return run(async () => c.json(await getFuelDashboardSummary(orgOf(c), from, to)));
  })
  .get(
    '/audit',
    rbac({ roles: FUEL_ROLES.supervise }),
    zValidator(
      'query',
      z.object({
        entityType: z.string().trim().max(50).optional(),
        entityId: uuid.optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      }),
    ),
    async (c) => {
      return c.json(await getFuelAuditLogs(orgOf(c), c.req.valid('query')));
    },
  )

  .post(
    '/jobs/daily',
    rbac({ roles: FUEL_ROLES.manage }),
    zValidator('json', z.object({ date: dateStr.optional() })),
    async (c) => {
      return run(async () => c.json(await runFuelDailyJob(orgOf(c), c.req.valid('json').date)));
    },
  );