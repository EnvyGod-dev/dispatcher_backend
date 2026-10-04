import {
  createVehicleOrganization,
  deleteVehicleOrganization,
  getVehicleOrganizationById,
  getVehicleOrganizationCount,
  getVehicleOrganizations,
  updateVehicleOrganization,
} from '$/context/vehicle-organization';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { ClientError, Forbidden } from '$/utils/errors';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

const vehicleOrganizationRoutes = new Hono<AppEnv>()
  .get(
    '/vehicle-organizations',
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number().default(25),
        offset: z.coerce.number().default(0),
      })
    ),
    async (c) => {
      const { limit, offset } = c.req.valid('query');

      const currentUser = c.get('currentUser');

      if (!currentUser || !currentUser.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const data = await getVehicleOrganizations(
        { limit, offset },
        { organizationId: currentUser.organizationId }
      );

      const totalCount = await getVehicleOrganizationCount({
        organizationId: currentUser.organizationId,
      });

      return c.json(data, {
        headers: {
          'X-Total-Count': totalCount.toString(),
        },
      });
    }
  )
  .post(
    '/vehicle-organization',
    zValidator(
      'json',
      z.object({
        name: z.string(),
      })
    ),
    async (c) => {
      const { name } = c.req.valid('json');
      const currentUser = c.get('currentUser');

      if (!currentUser || !currentUser.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const created = await createVehicleOrganization({
        name,
        organizationId: currentUser.organizationId,
      });

      return c.json(created);
    }
  )
  .put(
    '/vehicle-organization',
    zValidator(
      'json',
      z.object({
        id: z.string(),
        name: z.string(),
      })
    ),
    async (c) => {
      const currentUser = c.get('currentUser');
      const { id, name } = c.req.valid('json');

      const vehicleOrganization = await getVehicleOrganizationById(id);

      if (vehicleOrganization === null) {
        throw new ClientError('Туслан гүйцэтгэх компани олдсонгүй.');
      }

      if (vehicleOrganization.organizationId !== currentUser.organizationId) {
        throw new Forbidden();
      }

      const updated = await updateVehicleOrganization({ id, name });

      return c.json(updated);
    }
  )
  .delete(
    '/vehicle-organization',
    zValidator(
      'json',
      z.object({
        id: z.string(),
      })
    ),
    async (c) => {
      const { id } = c.req.valid('json');

      const deleted = await deleteVehicleOrganization(id);

      return c.json(deleted === true);
    }
  );

export default vehicleOrganizationRoutes;
