import {
  getVehicleByPk,
  getVehiclePictures,
  getVehicles,
  getVehicleWithoutJoin,
  VEHICLE_SORTABLE_COLUMNS,
} from '$/context/vehicle';
import { enumVehicleStatus, enumVehicleType } from '$/libs/database/schema';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { Forbidden } from '$/utils/errors';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

const vehicleRoutes = new Hono<AppEnv>()
  .get(
    '/shift-vehicles',
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number().default(50),
        offset: z.coerce.number().default(0),
        type: z.enum(enumVehicleType.enumValues).optional(),
      })
    ),
    async (c) => {
      const { type, limit, offset } = c.req.valid('query');

      const currentUser = c.get('currentUser');

      if (!currentUser.organizationId) {
        throw new Forbidden();
      }

      const data = await getVehicleWithoutJoin(
        {
          organizationId: currentUser.organizationId,
          type,
          excludedType:
            currentUser.role === 'assistant_operator' ? 'truck' : undefined,
        },
        { limit, offset }
      );

      return c.json(data);
    }
  )
  .get(
    '/vehicles',
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number().default(60),
        offset: z.coerce.number().default(0),
        type: z.enum(enumVehicleType.enumValues).optional(),
        name: z.string().optional(),
        code: z.string().optional(),
        vehicleNumber: z.string().optional(),
        vehicleOrganizationId: z.string().optional(),
        status: z.enum(enumVehicleStatus.enumValues).optional(),
        sortColumn: z.enum(VEHICLE_SORTABLE_COLUMNS).optional().default('createdAt'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
      })
    ),
    async (c) => {
      const user = c.get('currentUser');
      const { limit, offset, ...input } = c.req.valid('query');
      const effectiveLimit = limit === 60 ? undefined : limit;

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const vehicles = await getVehicles(
        { limit: effectiveLimit, offset },
        { ...input, organizationId: user.organizationId }
      );

      return c.json(vehicles, {
        headers: {
          'X-Total-Count': vehicles[0]?.totalCount.toString() ?? '0',
        },
      });
    }
  )
  .get(
    '/vehicle',
    zValidator(
      'query',
      z.object({
        id: z.string(),
      })
    ),
    async (c) => {
      const user = c.get('currentUser');
      const { id } = c.req.valid('query');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const vehicle = await getVehicleByPk(id);

      return c.json(vehicle);
    }
  )
  .get(
    '/vehicle/pictures',
    zValidator(
      'query',
      z.object({
        id: z.string(),
      })
    ),
    async (c) => {
      const user = c.get('currentUser');
      const { id } = c.req.valid('query');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const vehicle = await getVehiclePictures(id);

      return c.json(vehicle);
    }
  );

export default vehicleRoutes;
