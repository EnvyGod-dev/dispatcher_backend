import {
  assertRouteInOrganization,
  createStockpile,
  findActiveDuplicateStockpile,
  deleteStockpile,
  getStockpileByPk,
  getStockpiles,
  updateStockpile,
} from '$/context/stockpile';
import { enumStockPileType } from '$/libs/database/schema';
import { rbac } from '$/middlewares/rbac.middleware';
import type { AppEnv } from '$/utils/app-env';
import { ClientError, NotFound, Unauthorized } from '$/utils/errors';
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
        /** Веб: идэвхтэй/идэвхгүйгээр шүүх. Өгөхгүй бол бүгд. */
        status: z.enum(['active', 'inactive']).optional(),
      })
    ),
    async (c) => {
      const { offset, limit, type, layerNumber, status } = c.req.valid('query');

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
          status,
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
        /** null бол маршрутын холбоосыг арилгана. */
        routeId: z.string().uuid().nullable().optional(),
        /** false — идэвхгүй болгох, true — дахин идэвхжүүлэх. */
        isActive: z.boolean().optional(),
      })
    ),
    async (c) => {
      const { isActive, ...params } = c.req.valid('json');

      const currentUser = c.get('currentUser');

      if (!currentUser?.organizationId) {
        throw new Unauthorized('Missing organization ID');
      }

      if (params.routeId) {
        await assertRouteInOrganization(params.routeId, currentUser.organizationId);
      }

      const current = await getStockpileByPk(params.id);

      if (!current) {
        throw new NotFound();
      }

      // Идэвхтэй болох (эсвэл идэвхтэйг засах) үед ижил төрөл, дугаартай өөр идэвхтэй овоолго байж болохгүй.
      const willBeActive = isActive ?? !current.deactivatedAt;
      const nextType = params.type ?? current.type;
      const nextLayer = params.layerNumber ?? current.layerNumber;

      if (willBeActive && nextLayer) {
        const duplicate = await findActiveDuplicateStockpile({
          organizationId: currentUser.organizationId,
          type: nextType,
          layerNumber: nextLayer,
          excludeId: params.id,
        });

        if (duplicate) {
          throw new ClientError('Ижил төрөл, дугаартай идэвхтэй овоолго байна.');
        }
      }

      const updated = await updateStockpile({
        id: params.id,
        params: {
          ...params,
          ...(isActive !== undefined && {
            deactivatedAt: isActive ? null : new Date().toISOString(),
          }),
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
        routeId: z.string().uuid().nullable().optional(),
      })
    ),
    async (c) => {
      const params = c.req.valid('json');

      const currentUser = c.get('currentUser');

      if (!currentUser?.organizationId) {
        throw new Unauthorized('Missing organization ID');
      }

      if (params.routeId) {
        await assertRouteInOrganization(params.routeId, currentUser.organizationId);
      }

      const duplicate = await findActiveDuplicateStockpile({
        organizationId: currentUser.organizationId,
        type: params.type,
        layerNumber: params.layerNumber,
      });

      if (duplicate) {
        throw new ClientError('Ижил төрөл, дугаартай идэвхтэй овоолго аль хэдийн байна.');
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
