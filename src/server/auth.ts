import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthClient } from 'better-auth/client';
import { usernameClient } from 'better-auth/client/plugins';
import { username } from 'better-auth/plugins';
import bcrypt from 'bcrypt';

import { drizzleDb } from '$/libs/database/db';
import * as schema from '$/libs/database/schema';
import { hashPassword } from './hash-utils';

const nodeEnv = (process.env.NODE_ENV || 'development') as
  | 'development'
  | 'test'
  | 'production';

const isProduction = nodeEnv === 'production';

/**
 * LOCAL (/etc/hosts шаардлагагүй)
 *   lvh.me
 *   khavtsgait.lvh.me
 *   api.lvh.me
 *
 * PROD
 *   stratum.mn
 *   khavtsgait.stratum.mn
 *   api.stratum.mn
 *
 * ⚠️ `.localhost` БҮҮ ашигла — browser-ууд
 * Domain=.localhost cookie-г хүлээж авдаггүй.
 */
const cookieDomain =
  process.env.COOKIE_SUBDOMAIN ??
  (isProduction ? '.stratum.mn' : '.lvh.me');

/**
 * better-auth нь POST хүсэлт дээр Origin шалгадаг (CSRF).
 * Tenant subdomain-ууд trusted байх ёстой.
 */
const trustedOrigins = isProduction
  ? [
      'https://stratum.mn',
      'https://*.stratum.mn',
    ]
  : [
      'http://lvh.me:3000',
      'http://*.lvh.me:3000',
      'http://stratum.test:3000',
      'http://*.stratum.test:3000',
    ];

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,

  trustedOrigins,

  database: drizzleAdapter(drizzleDb, {
    provider: 'pg',
    schema,
  }),

  user: {
    modelName: 'users',

    fields: {
      id: 'id',
      username: 'username',
      email: 'email',
      name: 'name',
      firstName: 'firstName',
      lastName: 'lastName',
      organizationId: 'organizationId',
      imageUrl: 'imageUrl',
      phone: 'phone',
      role: 'role',
      isActive: 'isActive',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },

    additionalFields: {
      username: {
        type: 'string',
        required: true,
        input: true,
      },

      organizationId: {
        type: 'string',
        required: false,
        input: false,
      },

      role: {
        type: 'string',
        required: true,
        input: false,
      },

      isActive: {
        type: 'boolean',
        required: true,
        input: false,
      },

      phoneNumber: {
        type: 'string',
        required: false,
        input: false,
      },

      firstName: {
        type: 'string',
        required: false,
        input: false,
      },

      lastName: {
        type: 'string',
        required: false,
        input: false,
      },

      imageUrl: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  },

  plugins: [
    username(),
  ],

  emailAndPassword: {
    enabled: true,

    password: {
      hash: async (password) => {
        return hashPassword(password);
      },

      verify: async ({ hash, password }) => {
        return bcrypt.compare(password, hash);
      },
    },
  },

  advanced: {
    database: {
      generateId: false,
    },

    /**
     * ⚠️ MOBILE APP COMPAT
     *
     * baseURL https:// үед better-auth cookie нэрэнд
     * `__Secure-` угтвар автоматаар нэмдэг:
     *   better-auth.session_token -> __Secure-better-auth.session_token
     *
     * Mobile app хуучин нэрийг хүлээдэг тул угтваргүй байлгана.
     * `secure: true` attribute (доор) хэвээр — cookie зөвхөн HTTPS-ээр явна.
     */
    useSecureCookies: false,

    defaultCookieAttributes: {
      httpOnly: true,

      /**
       * Local (http) дээр false, production (https) дээр true.
       */
      secure: isProduction,

      /**
       * api.stratum.mn <-> khavtsgait.stratum.mn
       * eTLD+1 ижил тул same-site, lax хангалттай.
       */
      sameSite: 'lax',

      path: '/',
    },

    /**
     * Session cookie-г бүх tenant subdomain-д хуваалцана.
     */
    crossSubDomainCookies: {
      enabled: true,
      domain: cookieDomain,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24 * 7,

    /**
     * ⚠️ Cookie cache УНТРААЛТТАЙ.
     *
     * better-auth 1.3 нь session_data cookie-г session_token-той тулгахгүйгээр
     * шууд итгэдэг. Нэг browser дээр хэрэглэгч солигдох үед хуучин session_data
     * үлдвэл шинэ хэрэглэгч хуучин хэрэглэгчээр (жишээ нь superadmin → fuel_operator)
     * харагддаг байсан. Session-ийг токеноор нь DB-ээс шалгана.
     */
    cookieCache: {
      enabled: false,
    },
  },
});

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
  ],
});