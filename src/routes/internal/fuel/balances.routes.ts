import {
  createFuelMeasurement,
  createFuelOpeningBalance,
  getFuelDailyBalances,
  getFuelHolderBalances,
  getFuelLedgerHistory,
  getFuelMeasurements,
  getFuelOpeningBalances,
} from '$/context/fuel';
import { rbac } from '$/middlewares/rbac.middleware';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  FUEL_ROLES,
  dateTime,
  holderParam,
  holderTypeEnum,
  measurementSchema,
  measurementsQuery,
  openingBalanceSchema,
  orgOf,
  rangeQuery,
  run,
  toHolder,
  userOf,
} from './schemas';

export const fuelBalanceRoutes = new Hono<AppEnv>()
  .get(
    '/balances',
    rbac({ roles: FUEL_ROLES.view }),
    zValidator('query', z.object({ holderType: holderTypeEnum, at: dateTime.optional() })),
    async (c) => {
      const { holderType, at } = c.req.valid('query');

      return c.json(await getFuelHolderBalances(orgOf(c), holderType, at));
    },
  )
  .get(
    '/balances/:holderType/:id/history',
    rbac({ roles: FUEL_ROLES.view }),
    zValidator('param', holderParam),
    zValidator('query', rangeQuery),
    async (c) => {
      const { holderType, id } = c.req.valid('param');
      const { from, to } = c.req.valid('query');

      return run(async () => c.json(await getFuelLedgerHistory(orgOf(c), toHolder(holderType, id), from, to)));
    },
  )
  .get(
    '/balances/:holderType/:id/daily',
    rbac({ roles: FUEL_ROLES.view }),
    zValidator('param', holderParam),
    zValidator('query', rangeQuery),
    async (c) => {
      const { holderType, id } = c.req.valid('param');
      const { from, to } = c.req.valid('query');

      return run(async () => c.json(await getFuelDailyBalances(orgOf(c), toHolder(holderType, id), from, to)));
    },
  )

  .get(
    '/opening-balances',
    rbac({ roles: FUEL_ROLES.view }),
    zValidator('query', z.object({ holderType: holderTypeEnum.optional() })),
    async (c) => {
      return c.json(await getFuelOpeningBalances(orgOf(c), c.req.valid('query').holderType));
    },
  )
  .post('/opening-balances', rbac({ roles: FUEL_ROLES.register }), zValidator('json', openingBalanceSchema), async (c) => {
    const { holderId, ...body } = c.req.valid('json');

    return run(async () => {
      const opening = await createFuelOpeningBalance({
        ...body,
        ...toHolder(body.holderType, holderId),
        organizationId: orgOf(c),
        recordedBy: userOf(c).id,
      });

      return c.json(opening, 201);
    });
  })

  .get('/measurements', rbac({ roles: FUEL_ROLES.view }), zValidator('query', measurementsQuery), async (c) => {
    return c.json(await getFuelMeasurements(orgOf(c), c.req.valid('query')));
  })
  .post('/measurements', rbac({ roles: FUEL_ROLES.register }), zValidator('json', measurementSchema), async (c) => {
    const { holderId, applyAdjustment, ...body } = c.req.valid('json');
    const user = userOf(c);
    const canAdjust = (FUEL_ROLES.supervise as readonly string[]).includes(user.role);

    return run(async () => {
      const measurement = await createFuelMeasurement({
        ...body,
        ...toHolder(body.holderType, holderId),
        organizationId: orgOf(c),
        applyAdjustment: canAdjust && (applyAdjustment ?? false),
        recordedBy: user.id,
      });

      return c.json(measurement, 201);
    });
  });