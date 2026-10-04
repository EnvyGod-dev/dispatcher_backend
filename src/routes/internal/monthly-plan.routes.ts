import {
  createMonthlyPlan,
  deleteMonthlyPlan,
  getMonthlyPlans,
  getMonthlyPlanTotalCount,
  updateMonthlyPlan,
} from '$/context/monthly-plan';
import { rbac } from '$/middlewares/rbac.middleware';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

const monthlyPlanRoutes = new Hono<AppEnv>()
  .get(
    '/monthly-plans',
    rbac({ roles: ['dispatcher', 'admin', 'ita'] }),
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

      const data = await getMonthlyPlans(
        { limit, offset },
        {
          organizationId: user.organizationId,
        }
      );

      const totalCount = await getMonthlyPlanTotalCount({
        organizationId: user.organizationId,
      });

      return c.json(data, {
        headers: {
          'X-Total-Count': totalCount ?? '0',
        },
      });
    }
  )
  .post(
    '/monthly-plan',
    rbac({ roles: ['dispatcher', 'admin', 'ita'] }),
    zValidator(
      'json',
      z.object({
        coalAmount: z.string(),
        soilAmount: z.string(),
        year: z.number(),
        month: z.number(),
      })
    ),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');

      if (!['admin', 'dispatcher', 'superadmin'].includes(user.role)) {
        throw new HTTPException(403, {
          message: 'Only admins and dispatchers can create monthly plans',
        });
      }

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const plan = await createMonthlyPlan({
        ...body,
        organizationId: user.organizationId,
      });

      return c.json(plan, 201);
    }
  )
  .put(
    '/monthly-plan',
    rbac({ roles: ['dispatcher', 'admin'] }),
    zValidator(
      'json',
      z.object({
        id: z.string().uuid(),
        coalAmount: z.string(),
        soilAmount: z.string(),
      })
    ),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');

      // Only admin/dispatcher can update plans
      if (!['admin', 'dispatcher', 'superadmin'].includes(user.role)) {
        throw new HTTPException(403, {
          message: 'Only admins and dispatchers can update monthly plans',
        });
      }

      const plan = await updateMonthlyPlan(body);

      if (!plan) {
        throw new HTTPException(404, {
          message: 'Monthly plan not found',
        });
      }

      return c.json(plan);
    }
  )
  .delete(
    '/monthly-plan',
    rbac({ roles: ['dispatcher'] }),
    zValidator(
      'json',
      z.object({
        id: z.string().uuid(),
      })
    ),
    async (c) => {
      const { id } = c.req.valid('json');
      const user = c.get('currentUser');

      // Only admin/dispatcher can delete plans
      if (!['admin', 'dispatcher', 'superadmin'].includes(user.role)) {
        throw new HTTPException(403, {
          message: 'Only admins and dispatchers can delete monthly plans',
        });
      }

      const plan = await deleteMonthlyPlan(id);

      if (!plan) {
        throw new HTTPException(404, {
          message: 'Monthly plan not found',
        });
      }

      return c.json({ success: true });
    }
  );

export default monthlyPlanRoutes;
