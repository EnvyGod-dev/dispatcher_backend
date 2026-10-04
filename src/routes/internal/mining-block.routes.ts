import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import {
  createMiningBlock,
  deleteMiningBlock,
  getMiningBlockById,
  getMiningBlockByName,
  getMiningBlocks,
  updateMiningBlock,
} from '$/context/mining-block';
import { rbac } from '$/middlewares/rbac.middleware';
import { Unauthorized } from '$/utils/errors';

const miningBlockRoutes = new Hono<AppEnv>()
  .get(
    '/mining-block',
    rbac({ roles: ['dispatcher', 'admin'] }),
    zValidator(
      'query',
      z.object({
        id: z.string(),
      })
    ),
    async (c) => {
      const { id } = c.req.valid('query');

      const location = await getMiningBlockById(id);

      return c.json(location);
    }
  )
  .get(
    '/mining-blocks',
    rbac({ roles: ['dispatcher', 'admin'] }),
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number().default(25),
        offset: z.coerce.number().default(0),
        search: z.string().optional(),
        isActive: z
          .enum(['true', 'false'])
          .transform((value) => value === 'true')
          .optional(),
        layerNumber: z.string().optional(),
      })
    ),
    async (c) => {
      const { limit, offset, search, isActive, layerNumber } = c.req.valid('query');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const data = await getMiningBlocks(
        { limit, offset },
        {
          organizationId: user.organizationId,
          search,
          isActive,
          layerNumber,
        }
      );

      return c.json(data, {
        headers: {
          'X-Total-Count': data[0]?.totalCount.toString() ?? '0',
        },
      });
    }
  )
  .post(
    '/mining-block',
    rbac({ roles: ['dispatcher'] }),
    zValidator(
      'json',
      z.object({
        name: z.string(),
        layerNumber: z.string(),
        description: z.string().optional(),
        latitude: z.string().optional(),
        longitude: z.string().optional(),
      })
    ),
    async (c) => {
      const input = c.req.valid('json');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new Unauthorized();
      }

      const existing = await getMiningBlockByName(input.name);

      if (existing) {
        throw new HTTPException(422, {
          message: 'Уурхайн блок бүртгэлтэй байна.',
        });
      }
      const created = await createMiningBlock({
        ...input,
        type: 'pick_up',
        organizationId: user.organizationId,
      });

      return c.json(created);
    }
  )

  .put(
    '/mining-block',
    rbac({ roles: ['dispatcher'] }),
    zValidator(
      'json',
      z.object({
        id: z.string(),
        name: z.string(),
        layerNumber: z.string().optional(),
        description: z.string().optional(),
        latitude: z.string().optional(),
        longitude: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    ),
    async (c) => {
      const input = c.req.valid('json');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const created = await updateMiningBlock({
        input: { ...input, organizationId: user.organizationId },
        id: input.id,
      });

      return c.json(created);
    }
  )

  .delete(
    '/mining-block',
    rbac({ roles: ['dispatcher'] }),
    zValidator(
      'json',
      z.object({
        id: z.string(),
      })
    ),
    async (c) => {
      const { id } = c.req.valid('json');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      await deleteMiningBlock({ id, organizationId: user.organizationId });

      return c.json(true);
    }
  );

export default miningBlockRoutes;
