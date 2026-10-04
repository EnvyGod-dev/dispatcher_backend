import {
  createFuelNotificationRecipient,
  createFuelSupplier,
  createFuelTank,
  deleteFuelNorm,
  deleteFuelNotificationRecipient,
  getFuelDispensers,
  getFuelNorms,
  getFuelNotificationRecipients,
  getFuelSettings,
  getFuelSuppliers,
  getFuelTankByPk,
  getFuelTanks,
  getFuelVehicles,
  updateFuelNotificationRecipient,
  updateFuelSupplier,
  updateFuelTank,
  updateVehicleFuelProfile,
  upsertFuelNorm,
  upsertFuelSettings,
} from '$/context/fuel';
import { rbac } from '$/middlewares/rbac.middleware';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  FUEL_ROLES,
  boolQuery,
  idParam,
  normSchema,
  notFoundIfNull,
  orgOf,
  recipientSchema,
  run,
  settingsSchema,
  supplierSchema,
  tankSchema,
  userOf,
  vehicleFuelProfileSchema,
} from './schemas';

const toNumericString = (value: number | null | undefined) => {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? null : String(value);
};

export const fuelMasterRoutes = new Hono<AppEnv>()
  .get('/tanks', rbac({ roles: FUEL_ROLES.view }), async (c) => {
    return c.json(await getFuelTanks(orgOf(c)));
  })
  .get('/tanks/:id', rbac({ roles: FUEL_ROLES.view }), zValidator('param', idParam), async (c) => {
    const tank = await getFuelTankByPk(orgOf(c), c.req.valid('param').id);

    return c.json(notFoundIfNull(tank, 'Агуулах олдсонгүй.'));
  })
  .post('/tanks', rbac({ roles: FUEL_ROLES.manage }), zValidator('json', tankSchema), async (c) => {
    const body = c.req.valid('json');

    return run(async () => {
      const tank = await createFuelTank({
        organizationId: orgOf(c),
        name: body.name,
        location: body.location ?? null,
        capacity: toNumericString(body.capacity) ?? null,
        fuelType: body.fuelType,
        isActive: body.isActive ?? true,
      });

      return c.json(tank, 201);
    });
  })
  .put(
    '/tanks/:id',
    rbac({ roles: FUEL_ROLES.manage }),
    zValidator('param', idParam),
    zValidator('json', tankSchema.partial()),
    async (c) => {
      const body = c.req.valid('json');

      return run(async () => {
        const tank = await updateFuelTank(orgOf(c), c.req.valid('param').id, {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.location !== undefined && { location: body.location }),
          ...(body.capacity !== undefined && { capacity: toNumericString(body.capacity) }),
          ...(body.fuelType !== undefined && { fuelType: body.fuelType }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        });

        return c.json(notFoundIfNull(tank, 'Агуулах олдсонгүй.'));
      });
    },
  )

  .get('/suppliers', rbac({ roles: FUEL_ROLES.view }), async (c) => {
    return c.json(await getFuelSuppliers(orgOf(c)));
  })
  .post('/suppliers', rbac({ roles: FUEL_ROLES.operate }), zValidator('json', supplierSchema), async (c) => {
    const body = c.req.valid('json');

    return run(async () => {
      const supplier = await createFuelSupplier({
        organizationId: orgOf(c),
        name: body.name,
        contactPhone: body.contactPhone ?? null,
        contactEmail: body.contactEmail ?? null,
        isActive: body.isActive ?? true,
      });

      return c.json(supplier, 201);
    });
  })
  .put(
    '/suppliers/:id',
    rbac({ roles: FUEL_ROLES.manage }),
    zValidator('param', idParam),
    zValidator('json', supplierSchema.partial()),
    async (c) => {
      return run(async () => {
        const supplier = await updateFuelSupplier(orgOf(c), c.req.valid('param').id, c.req.valid('json'));

        return c.json(notFoundIfNull(supplier, 'Нийлүүлэгч олдсонгүй.'));
      });
    },
  )

  .get(
    '/vehicles',
    rbac({ roles: FUEL_ROLES.view }),
    zValidator('query', z.object({ dispenserOnly: boolQuery.optional() })),
    async (c) => {
      const { dispenserOnly } = c.req.valid('query');

      return c.json(dispenserOnly ? await getFuelDispensers(orgOf(c)) : await getFuelVehicles(orgOf(c)));
    },
  )
  .put(
    '/vehicles/:id/fuel-profile',
    rbac({ roles: FUEL_ROLES.manage }),
    zValidator('param', idParam),
    zValidator('json', vehicleFuelProfileSchema),
    async (c) => {
      return run(async () => {
        const vehicle = await updateVehicleFuelProfile(
          orgOf(c),
          c.req.valid('param').id,
          c.req.valid('json'),
          userOf(c).id,
        );

        return c.json(vehicle);
      });
    },
  )

  .get('/norms', rbac({ roles: FUEL_ROLES.view }), async (c) => {
    return c.json(await getFuelNorms(orgOf(c)));
  })
  .put('/norms', rbac({ roles: FUEL_ROLES.engineer }), zValidator('json', normSchema), async (c) => {
    return run(async () => {
      const norm = await upsertFuelNorm({ organizationId: orgOf(c), ...c.req.valid('json') });

      return c.json(norm);
    });
  })
  .delete('/norms/:id', rbac({ roles: FUEL_ROLES.engineer }), zValidator('param', idParam), async (c) => {
    const norm = await deleteFuelNorm(orgOf(c), c.req.valid('param').id);

    notFoundIfNull(norm, 'Норм олдсонгүй.');

    return c.body(null, 204);
  })

  .get('/settings', rbac({ roles: FUEL_ROLES.view }), async (c) => {
    return c.json(await getFuelSettings(orgOf(c)));
  })
  .put('/settings', rbac({ roles: FUEL_ROLES.manage }), zValidator('json', settingsSchema), async (c) => {
    const body = c.req.valid('json');

    return run(async () => {
      const settings = await upsertFuelSettings(orgOf(c), {
        ...(body.defaultThresholdPercent !== undefined && {
          defaultThresholdPercent: String(body.defaultThresholdPercent),
        }),
        ...(body.alertWindowDays !== undefined && { alertWindowDays: body.alertWindowDays }),
        ...(body.alertEmailEnabled !== undefined && { alertEmailEnabled: body.alertEmailEnabled }),
        ...(body.actNumberPrefix !== undefined && { actNumberPrefix: body.actNumberPrefix }),
      });

      return c.json(settings);
    });
  })

  .get(
    '/recipients',
    rbac({ roles: FUEL_ROLES.manage }),
    zValidator('query', z.object({ purpose: z.enum(['act', 'alert']).optional() })),
    async (c) => {
      return c.json(await getFuelNotificationRecipients(orgOf(c), c.req.valid('query').purpose));
    },
  )
  .post('/recipients', rbac({ roles: FUEL_ROLES.manage }), zValidator('json', recipientSchema), async (c) => {
    const body = c.req.valid('json');

    return run(async () => {
      const recipient = await createFuelNotificationRecipient({
        organizationId: orgOf(c),
        purpose: body.purpose,
        email: body.email,
        name: body.name ?? null,
        isCc: body.isCc ?? false,
        isActive: body.isActive ?? true,
      });

      return c.json(recipient, 201);
    });
  })
  .put(
    '/recipients/:id',
    rbac({ roles: FUEL_ROLES.manage }),
    zValidator('param', idParam),
    zValidator('json', recipientSchema.partial()),
    async (c) => {
      return run(async () => {
        const recipient = await updateFuelNotificationRecipient(orgOf(c), c.req.valid('param').id, c.req.valid('json'));

        return c.json(notFoundIfNull(recipient, 'Хүлээн авагч олдсонгүй.'));
      });
    },
  )
  .delete('/recipients/:id', rbac({ roles: FUEL_ROLES.manage }), zValidator('param', idParam), async (c) => {
    const recipient = await deleteFuelNotificationRecipient(orgOf(c), c.req.valid('param').id);

    notFoundIfNull(recipient, 'Хүлээн авагч олдсонгүй.');

    return c.body(null, 204);
  });