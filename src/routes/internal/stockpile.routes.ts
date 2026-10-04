import {
  createStockpile,
  deleteStockpile,
  getStockpileByPk,
  getStockpiles,
  updateStockpile,
} from '$/context/stockpile';
import { enumStockPileType } from '$/libs/database/schema';
import { rbac } from '$/middlewares/rbac.middleware';
import type { AppEnv } from '$/utils/app-env';
import { NotFound, Unauthorized } from '$/utils/errors';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

export default new Hono<AppEnv>()
  .get(
    '/stockpiles',
    rbac({ roles: ['admin', 'dispatcher'] }),
    zValidator(
      'query',
      z.object({
        offset: z.coerce.number().default(0),
        limit: z.coerce.number().default(50),
        type: z.enum(enumStockPileType.enumValues).optional(),
        layerNumber: z.string().optional(),
      })
    ),
    async (c) => {
      const { offset, limit, type, layerNumber } = c.req.valid('query');

      const currentUser = c.get('currentUser');

      if (!currentUser.organizationId) {
        throw new Unauthorized();
      }

      const data = await getStockpiles(
        { limit, offset },
        {
          organizationId: currentUser.organizationId,
          type,
          layerNumber,
        }
      );

      return c.json(data, {
        headers: {
          'X-Total-Count': data[0]?.totalCount.toString() || '0',
        },
      });
    }
  )
  .put(
    '/stockpile',
    rbac({ roles: ['dispatcher'] }),
    zValidator(
      'json',
      z.object({
        id: z.string(),
        layerNumber: z.string().optional(),
        type: z.enum(enumStockPileType.enumValues).optional(),
      })
    ),
    async (c) => {
      const params = c.req.valid('json');

      const currentUser = c.get('currentUser');

      if (!currentUser?.organizationId) {
        throw new Unauthorized('Missing organization ID');
      }

      const updated = await updateStockpile({
        id: params.id,
        params: {
          ...params,
          organizationId: currentUser.organizationId,
        },
      });

      return c.json(updated);
    }
  )
  .post(
    '/stockpile',
    rbac({ roles: ['dispatcher'] }),
    zValidator(
      'json',
      z.object({
        type: z.enum(enumStockPileType.enumValues),
        layerNumber: z.string(),
      })
    ),
    async (c) => {
      const params = c.req.valid('json');

      const currentUser = c.get('currentUser');

      if (!currentUser?.organizationId) {
        throw new Unauthorized('Missing organization ID');
      }

      const created = await createStockpile({
        ...params,
        organizationId: currentUser.organizationId,
        createdBy: currentUser.id,
      });

      return c.json(created);
    }
  )
  .delete(
    '/stockpile',
    rbac({ roles: ['dispatcher'] }),
    zValidator(
      'json',
      z.object({
        id: z.string(),
      })
    ),
    async (c) => {
      const { id } = c.req.valid('json');
      const currentUser = c.get('currentUser');

      if (!currentUser.organizationId) {
        throw new Unauthorized();
      }

      const stockpile = await getStockpileByPk(id);

      if (!stockpile) {
        throw new NotFound();
      }

      if (stockpile.organizationId !== currentUser.organizationId) {
        throw new Unauthorized();
      }

      await deleteStockpile(id);

      return c.json(true);
    }
  );
