import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';

import { authMiddleware } from './middlewares/auth.middleware';
import { organizationScope } from './middlewares/rbac.middleware';
import errorHandler from './middlewares/error.middleware';

import adminRoutes from './routes/admin';
import authRoutes from './routes/auth.routes';
import iamRoutes from './routes/iam.routes';
import internalRoutes from './routes/internal';
import publicRoutes from './routes/public.routes';
import superAdminRoutes from './routes/superadmin';

import type { AppEnv } from './utils/app-env';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Local dev root domain-ууд (http, port 3000).
 *
 * lvh.me       -> /etc/hosts шаардлагагүй (*.lvh.me = 127.0.0.1)
 * stratum.test -> /etc/hosts-оор
 * localhost    -> cookie хуваалцахгүй, зөвхөн CORS
 */
const DEV_ROOT_DOMAINS = [
  'localhost',
  'lvh.me',
  'stratum.test',
];

const isDevOrigin = (url: URL) =>
  !isProduction &&
  url.protocol === 'http:' &&
  url.port === '3000' &&
  DEV_ROOT_DOMAINS.some(
    (root) =>
      url.hostname === root ||
      url.hostname.endsWith(`.${root}`)
  );

const isProdOrigin = (url: URL) =>
  url.protocol === 'https:' &&
  (
    url.hostname === 'stratum.mn' ||
    url.hostname.endsWith('.stratum.mn')
  );

const app = new Hono<AppEnv>()
  .basePath('/api')

  // ─────────────────────────────────────────────
  // GLOBAL
  // ─────────────────────────────────────────────

  .use('*', logger())

  .use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) {
          return '';
        }

        try {
          const url = new URL(origin);

          if (isDevOrigin(url) || isProdOrigin(url)) {
            return origin;
          }

          return '';
        } catch {
          return '';
        }
      },

      allowHeaders: [
        'Content-Type',
        'Authorization',
        'X-Organization-Subdomain',
      ],

      exposeHeaders: [
        'X-Total-Count',
      ],

      credentials: true,
    })
  )

  .use('*', prettyJSON())

  .use(
    '*',
    secureHeaders({
      crossOriginResourcePolicy: false,
    })
  )

  .use('*', timing())

  // ─────────────────────────────────────────────
  // MOBILE APP COMPAT
  //
  // Хуучин mobile app sign-in response-ийн BODY-оос
  //   resp['setCookie']!
  // уншдаг. Set-Cookie header-ээс "name=value; name=value"
  // string угсарч body-д нэмнэ. Web үүнийг үл тоомсорлоно.
  //
  // ⚠️ .route('/auth', ...)-аас ӨМНӨ байх ёстой.
  // ─────────────────────────────────────────────

  .use('/auth/sign-in', async (c, next) => {
    await next();

    if (c.req.method !== 'POST' || c.res.status !== 200) {
      return;
    }

    const contentType = c.res.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      return;
    }

    const cookies = c.res.headers.getSetCookie();

    if (cookies.length === 0) {
      return;
    }

    /**
     * "better-auth.session_token=xxx; Max-Age=...; Domain=..."
     *   -> "better-auth.session_token=xxx"
     */
    const setCookie = cookies
      .map((cookie) => (cookie.split(';')[0] ?? '').trim())
      .filter(Boolean)
      .join('; ');

    if (!setCookie) {
      return;
    }

    const body = await c.res
      .clone()
      .json()
      .catch(() => null);

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      'setCookie' in body
    ) {
      return;
    }

    /**
     * Header-уудыг ШИНЭ object болгон хуулна.
     * content-type-ийг тодорхой тавина — эс тэгвэл
     * mobile app (Dio) body-г String гэж уншина.
     */
    const headers = new Headers(c.res.headers);
    headers.set('content-type', 'application/json; charset=UTF-8');
    headers.delete('content-length');

    c.res = new Response(
      JSON.stringify({ ...body, setCookie }),
      {
        status: 200,
        headers,
      }
    );
  })

  // ─────────────────────────────────────────────
  // PUBLIC
  // ─────────────────────────────────────────────

  .route('/', publicRoutes)

  .route('/auth', authRoutes)

  // ─────────────────────────────────────────────
  // AUTHENTICATION
  //
  // Энд зөвхөн login/session шалгана.
  // ─────────────────────────────────────────────

  .use('/superadmin/*', authMiddleware)

  .use('/admin/*', authMiddleware)

  /**
   * IAM:
   *
   * /api/iam нь current user + organization
   * мэдээлэл авах bootstrap endpoint.
   *
   * organizationScope ТАВИХГҮЙ.
   */
  .use('/iam/*', authMiddleware)

  .use('/resource/*', authMiddleware)

  .use('/internal/*', authMiddleware)

  // ─────────────────────────────────────────────
  // ORGANIZATION TENANT SCOPE
  //
  // authMiddleware-ийн ДАРАА байна.
  // ─────────────────────────────────────────────

  .use('/admin/*', organizationScope)

  .use('/resource/*', organizationScope)

  /**
   * dashboard-metrics гэх мэт internal API
   * organization-specific тул scope тавина.
   */
  .use('/internal/*', organizationScope)

  /**
   * ❌ IAM болон Superadmin дээр
   * organizationScope БҮҮ нэм.
   */

  // ─────────────────────────────────────────────
  // ROUTES
  // ─────────────────────────────────────────────

  .route('/superadmin', superAdminRoutes)

  .route('/admin', adminRoutes)

  .route('/iam', iamRoutes)

  .route('/internal', internalRoutes)

  .onError(errorHandler);

export type AppType = typeof app;

export { app };

export default app;