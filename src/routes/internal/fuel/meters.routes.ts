import { createFuelMeter, deleteFuelMeter, getFuelMeters, updateFuelMeter } from '$/context/fuel';
import { rbac } from '$/middlewares/rbac.middleware';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import { FUEL_ROLES, idParam, meterCreateSchema, meterUpdateSchema, orgOf, run, userOf } from './schemas';

/**
 * Агуулах, түгээгч машины тоолуур.
 * Харах: түлшний ажилтан ч (олголтын эхний заалтыг автоматаар бөглөхөд). Бүртгэх/засах: админ, диспетчер.
 */
export const fuelMeterRoutes = new Hono<AppEnv>()
  .get('/meters', rbac({ roles: FUEL_ROLES.view }), async (c) => {
    return c.json(await getFuelMeters(orgOf(c)));
  })
  .post('/meters', rbac({ roles: FUEL_ROLES.register }), zValidator('json', meterCreateSchema), async (c) => {
    const body = c.req.valid('json');

    return run(async () => c.json(await createFuelMeter({ ...body, organizationId: orgOf(c), userId: userOf(c).id }), 201));
  })
  .put(
    '/meters/:id',
    rbac({ roles: FUEL_ROLES.register }),
    zValidator('param', idParam),
    zValidator('json', meterUpdateSchema),
    async (c) => {
      const body = c.req.valid('json');

      return run(async () =>
        c.json(
          await updateFuelMeter({ ...body, id: c.req.valid('param').id, organizationId: orgOf(c), userId: userOf(c).id }),
        ),
      );
    },
  )
  .delete('/meters/:id', rbac({ roles: FUEL_ROLES.register }), zValidator('param', idParam), async (c) => {
    return run(async () => c.json(await deleteFuelMeter(orgOf(c), c.req.valid('param').id, userOf(c).id)));
  });
