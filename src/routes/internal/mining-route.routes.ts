import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import {
  createRoute,
  deleteRoute,
  getRouteById,
  getRoutes,
  updateRoute,
} from '$/context/mining-route';
import { rbac } from '$/middlewares/rbac.middleware';

const routeRoutes = new Hono<AppEnv>()
  .get(
    '/route',
    rbac({ roles: ['dispatcher', 'admin'] }),
    zValidator(
      'query',
      z.object({
        id: z.string().uuid(),
      })
    ),
    async (c) => {
      const { id } = c.req.valid('query');

      const route = await getRouteById(id);

      if (!route) {
        throw new HTTPException(404, {
          message: 'Route not found',
        });
      }

      return c.json(route);
    }
  )
  .get(
    '/routes',
    rbac({ roles: ['dispatcher', 'admin'] }),
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number().default(25),
        offset: z.coerce.number().default(0),
      })
    ),
    async (c) => {
      const { limit, offset } = c.req.valid('query');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const data = await getRoutes(
        { limit, offset },
        { organizationId: user.organizationId }
      );

      return c.json(data, {
        headers: {
          'X-Total-Count': data[0]?.totalCount.toString() ?? '0',
        },
      });
    }
  )
  .post(
    '/route',
    rbac({ roles: ['admin', 'dispatcher'] }),
    zValidator(
      'json',
      z.object({
        routeCode: z.string().optional(),
        description: z.string().optional(),
      })
    ),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      try {
        const route = await createRoute({
          ...body,
          organizationId: user.organizationId,
        });

        return c.json(route, 201);
      } catch (error) {
        if (error instanceof Error) {
          throw new HTTPException(400, {
            message: error.message,
          });
        }
        throw error;
      }
    }
  )
  .put(
    '/route',
    rbac({ roles: ['admin', 'dispatcher'] }),
    zValidator(
      'json',
      z.object({
        id: z.string().uuid(),
        routeCode: z.string().optional(),
        description: z.string().optional(),
      })
    ),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');

      try {
        const route = await updateRoute(body);

        if (!route) {
          throw new HTTPException(404, {
            message: 'Route not found',
          });
        }

        return c.json(route);
      } catch (error) {
        if (error instanceof Error) {
          throw new HTTPException(400, {
            message: error.message,
          });
        }
        throw error;
      }
    }
  )
  .delete(
    '/route',
    rbac({ roles: ['admin', 'dispatcher'] }),
    zValidator(
      'query',
      z.object({
        id: z.string().uuid(),
      })
    ),
    async (c) => {
      const { id } = c.req.valid('query');
      const user = c.get('currentUser');

      const route = await deleteRoute(id);

      if (!route) {
        throw new HTTPException(404, {
          message: 'Route not found',
        });
      }

      return c.json({ success: true });
    }
  );
export default routeRoutes;
