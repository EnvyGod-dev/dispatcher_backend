import {
  createMiningSection,
  deleteMiningSection,
  getMiningSectionById,
  getMiningSectionCount,
  getMiningSections,
  updateMiningSection,
} from '$/context/mining-section';
import { rbac } from '$/middlewares/rbac.middleware';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { ClientError } from '$/utils/errors';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

const miningSectionRoutes = new Hono<AppEnv>()
  .get(
    '/mining-sections',
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

      const currentUser = c.get('currentUser');

      if (!currentUser || !currentUser.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const data = await getMiningSections(
        { limit, offset },
        { organizationId: currentUser.organizationId }
      );

      const totalCount = await getMiningSectionCount({
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
    '/mining-section',
    rbac({ roles: ['dispatcher'] }),
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

      const created = await createMiningSection({
        name,
        organizationId: currentUser.organizationId,
      });

      return c.json(created);
    }
  )
  .put(
    '/mining-section',
    rbac({ roles: ['dispatcher'] }),
    zValidator(
      'json',
      z.object({
        id: z.string(),
        name: z.string(),
      })
    ),
    async (c) => {
      const { id, name } = c.req.valid('json');
      const currentUser = c.get('currentUser');

      const miningSection = await getMiningSectionById({
        id,
        organizationId: currentUser.organizationId ?? undefined,
      });

      if (!miningSection) {
        throw new ClientError('Уулын хэсэг олдсонгүй.');
      }

      const updated = await updateMiningSection({
        name,
        id,
      });

      return c.json(updated);
    }
  )

  .delete(
    '/mining-section',
    rbac({ roles: ['dispatcher'] }),
    zValidator('json', z.object({ id: z.string() })),
    async (c) => {
      const { id } = c.req.valid('json');

      const result = await deleteMiningSection(id);

      return c.json(result !== null);
    }
  );
export default miningSectionRoutes;
