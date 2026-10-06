import { getOrganizationByPk } from '$/context/organization';
import { getUserByPhoneNumber } from '$/context/user';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import { auth } from '$/server/auth';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

/**
 * Better Auth нэг хариунд хэд хэдэн cookie тавьдаг
 * (session_token, session_data, dont_remember).
 *
 * ⚠️ `headers.get('Set-Cookie')` тэдгээрийг таслалаар нийлүүлж НЭГ мөр болгодог тул
 * browser зөвхөн эхнийхийг нь хүлээж авдаг. Үүнээс болж өмнөх хэрэглэгчийн
 * session_data cookie үлдэж, өөр хэрэглэгчээр нэвтэрсэн ч хуучин хүнээр орж байсан.
 * Cookie бүрийг тусад нь дамжуулна.
 */
const forwardSetCookies = (c: Context, response: Response) => {
  for (const cookie of response.headers.getSetCookie()) {
    c.header('Set-Cookie', cookie, { append: true });
  }
};

const authRoutes = new Hono()
  .post(
    '/sign-in',
    zValidator(
      'json',
      z.object({
        phoneNumber: z.string().trim(),
        password: z.string(),
      }),
    ),
    async (c) => {
      const { phoneNumber, password } =
        c.req.valid('json');

      const user = await getUserByPhoneNumber(
        Number(phoneNumber),
      );

      if (!user) {
        return c.json(
          {
            error: 'Invalid username or password',
          },
          400,
        );
      }

      /**
       * Superadmin-аас бусад хэрэглэгч
       * organization-тай байх ёстой.
       */
      if (
        user.role !== 'superadmin' &&
        !user.organizationId
      ) {
        return c.json(
          {
            error:
              'Хэрэглэгч байгууллагад хуваарилагдаагүй байна.',
          },
          403,
        );
      }

      if (user.status !== 'available') {
        return c.json(
          {
            error:
              'Хэрэглэгчийн төлөв идэвхгүй байна.',
          },
          403,
        );
      }

      /**
       * Better Auth login
       */
      const response =
        await auth.api.signInUsername({
          body: {
            username: phoneNumber,
            password,
            // Session-ийг browser хаасан ч хадгална (30 хоног, sliding).
            rememberMe: true,
          },
          asResponse: true,
        });

      if (!response.ok) {
        return c.json(
          {
            error: 'Invalid username or password',
          },
          400,
        );
      }

      /**
       * Better Auth-аас ирсэн cookie-г
       * browser руу header-аар дамжуулна.
       */
      forwardSetCookies(c, response);

      /**
       * User-ийн organization-ийг авна.
       */
      const organization =
        user.organizationId
          ? await getOrganizationByPk(
              user.organizationId,
            )
          : null;

      if (
        user.role !== 'superadmin' &&
        (!organization ||
          organization.deactivatedAt)
      ) {
        return c.json(
          {
            error:
              'Байгууллага олдсонгүй эсвэл идэвхгүй байна.',
          },
          403,
        );
      }

      /**
       * ⚠️ setCookie-г JSON body руу
       * ХЭЗЭЭ Ч буцаахгүй.
       */
      return c.json({
        ...user,
        organization,
      });
    },
  )

  .post('/sign-out', async (c) => {
    const response =
      await auth.api.signOut({
        headers: c.req.raw.headers,
        asResponse: true,
      });

    forwardSetCookies(c, response);

    return c.json({
      success: response.ok,
    });
  });

export default authRoutes;