import { auth } from '$/server/auth';
import {
  type Context,
  type MiddlewareHandler,
  type Next,
} from 'hono';
import { HTTPException } from 'hono/http-exception';

const hrAdminPaths = new Set([
  '/api/admin/employees',
  '/api/admin/register-user',
  '/api/admin/register-user/bulk',
  '/api/admin/employee-status',
  '/api/admin/employee',
  '/api/admin/user',
  '/api/admin/user/upload-image',
  '/api/admin/change-password',
]);

export const authMiddleware: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  const path = c.req.path;

  /**
   * Better Auth өөрөө Cookie header-ийг parse хийнэ.
   *
   * better-auth.session_token=...
   */
  const { headers: sessionHeaders, response: session } =
    await auth.api.getSession({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });

  /**
   * Better Auth session-ийг сунгах (updateAge) эсвэл cookieCache-ийг
   * шинэчлэх үед Set-Cookie буцаадаг. Үүнийг client руу дамжуулахгүй бол
   * browser дахь cookie хуучирч, хэсэг хугацааны дараа санамсаргүй 401 өгнө.
   */
  const forwardSessionCookies = () => {
    sessionHeaders?.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        c.header('Set-Cookie', value, { append: true });
      }
    });
  };

  forwardSessionCookies();

  if (!session?.user) {
    // Cookie ирсэн боловч session олдоогүй бол шалтгааныг логонд үлдээнэ (гэнэт гаргадаг асуудлыг оношлоход).
    const cookieHeader = c.req.header('cookie') ?? '';

    if (cookieHeader.includes('session_token')) {
      console.warn('[auth] session not found for request with session cookie', {
        path,
        origin: c.req.header('origin') ?? null,
        userAgent: (c.req.header('user-agent') ?? '').slice(0, 80),
      });
    }

    throw new HTTPException(401, {
      message: 'Unauthenticated',
    });
  }

  if (!session.user.isActive) {
    throw new HTTPException(403, {
      message: 'User inactive',
    });
  }

  const currentUser = session.user;

  /**
   * Эхлээд currentUser context-д тавина.
   */
  c.set('currentUser', currentUser);

  /**
   * SUPERADMIN
   */
  if (
    path.startsWith('/api/superadmin/') &&
    currentUser.role !== 'superadmin'
  ) {
    throw new HTTPException(403, {
      message: 'Unauthorized',
    });
  }

  /**
   * ADMIN
   */
  if (
    path.startsWith('/api/admin/') &&
    !['admin', 'superadmin', 'dispatcher'].includes(
      currentUser.role
    )
  ) {
    /**
     * HR-д зөвшөөрөгдсөн admin endpoints.
     */
    if (
      currentUser.role === 'hr' &&
      hrAdminPaths.has(path)
    ) {
      await next();
      return;
    }

    throw new HTTPException(403, {
      message: 'Admin access required',
    });
  }

  await next();
};