import { getUserByPk, updateUser } from '$/context/user';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import { auth } from '$/server/auth';
import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

type BetterAuthResponse = {
  code: string;
  message: string;
};

const iamRoutes = new Hono<AppEnv>()
  .get('/test', async (c) => {
    const user = {
      id: '1',
      email: 'test@gmail.com',
    };

    return c.json(user);
  })

  .post(
    '/change-password',
    zValidator(
      'json',
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8),
      })
    ),
    async (c) => {
      const { currentPassword, newPassword } = c.req.valid('json');

      const response = await auth.api.changePassword({
        body: {
          currentPassword,
          newPassword,
        },
        headers: c.req.raw.headers,
        asResponse: true,
      });

      const res = (await response.json()) as BetterAuthResponse;

      if (!response.ok) {
        throw new HTTPException(400, {
          message: res.message,
        });
      }

      return c.json({
        ok: true,
      });
    }
  )
  .put(
    '/profile',
    zValidator(
      'json',
      z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        imageUrl: z.string().url().optional(),
      })
    ),
    async (c) => {
      const input = c.req.valid('json');
      const currentUser = c.get('currentUser');

      const updated = await updateUser(currentUser.id, input);

      return c.json(updated);
    }
  )

  .get('/', async (c) => {
    const currentUser = c.get('currentUser');

    const user = await getUserByPk(currentUser.id);

    return c.json(user);
  });

export default iamRoutes;
