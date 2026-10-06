import { getOrganizationByPk } from '$/context/organization';
import type { UserRole } from '$/context/user/types';
import {
  type Context,
  type MiddlewareHandler,
} from 'hono';
import { HTTPException } from 'hono/http-exception';

interface RBACOptions {
  roles: UserRole[];
  ownershipCheck?: (c: Context) => Promise<boolean>;
}

const SUBDOMAIN_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Role Based Access Control
 */
export const rbac = (
  options: RBACOptions
): MiddlewareHandler => {
  return async (c, next) => {
    const currentUser = c.get('currentUser');

    if (!currentUser) {
      throw new HTTPException(401, {
        message: 'Unauthorized',
      });
    }

    if (!options.roles.includes(currentUser.role)) {
      throw new HTTPException(403, {
        message: `Forbidden: Required roles: ${options.roles.join(', ')}`,
      });
    }

    if (options.ownershipCheck) {
      const hasOwnership =
        await options.ownershipCheck(c);

      if (!hasOwnership) {
        throw new HTTPException(403, {
          message:
            'Forbidden: You do not own this resource',
        });
      }
    }

    await next();
  };
};

/**
 * Organization Tenant Scope
 *
 * Байгууллагыг ҮРГЭЛЖ session user-ээс тодорхойлно.
 * Client-аас organizationId авахгүй.
 *
 * X-Organization-Subdomain header:
 *
 *   WEB (khavtsgait.stratum.mn)
 *     header ирнэ -> user-ийн subdomain-тай тулгана
 *       match    -> allow
 *       mismatch -> 403
 *
 *   MOBILE APP
 *     header ирэхгүй -> user-ийн өөрийн organization
 *     (URL байхгүй тул тулгах зүйлгүй)
 */
export const organizationScope: MiddlewareHandler =
  async (c, next) => {
    const currentUser = c.get('currentUser');

    if (!currentUser) {
      throw new HTTPException(401, {
        message: 'Unauthorized',
      });
    }

    /**
     * Superadmin бүх organization руу
     * хандах боломжтой.
     */
    if (currentUser.role === 'superadmin') {
      await next();
      return;
    }

    /**
     * Tenant user organization-тай
     * заавал холбоотой байна.
     */
    if (!currentUser.organizationId) {
      throw new HTTPException(403, {
        message: 'User organization олдсонгүй.',
      });
    }

    /**
     * Session user-ийн ӨӨРИЙН organization.
     */
    const organization =
      await getOrganizationByPk(
        currentUser.organizationId
      );

    if (!organization) {
      throw new HTTPException(403, {
        message: 'Байгууллага олдсонгүй.',
      });
    }

    /**
     * Organization inactive.
     */
    if (organization.deactivatedAt) {
      throw new HTTPException(403, {
        message: 'Байгууллага идэвхгүй байна.',
      });
    }

    const requestedSubdomain = c.req
      .header('X-Organization-Subdomain')
      ?.trim()
      .toLowerCase();

    /**
     * Header ирсэн үед л (web) tenant URL-ийг тулгана.
     * Header байхгүй (mobile app) бол session-ий
     * organization-оор шууд үргэлжилнэ.
     */
    if (requestedSubdomain) {
      if (!SUBDOMAIN_REGEX.test(requestedSubdomain)) {
        throw new HTTPException(400, {
          message:
            'Organization subdomain буруу форматтай байна.',
        });
      }

      const organizationSubdomain =
        organization.subdomain
          ?.trim()
          .toLowerCase();

      /**
       * SECURITY CHECK
       *
       * Logged user:
       *   organization.subdomain = khavtsgait
       *
       * Browser:
       *   X-Organization-Subdomain = other-company
       *
       * => 403
       */
      if (
        !organizationSubdomain ||
        organizationSubdomain !== requestedSubdomain
      ) {
        throw new HTTPException(403, {
          message:
            'Энэ байгууллагад хандах эрхгүй байна.',
        });
      }
    }

    /**
     * Downstream routes:
     *
     * c.get('organizationId')
     */
    c.set(
      'organizationId',
      organization.id
    );

    await next();
  };
/**
 * Зөвхөн харах эрхтэй дүрүүд (удирдлага). Эдгээр хэрэглэгч ямар ч өгөгдөл өөрчлөх (POST/PUT/PATCH/DELETE)
 * хүсэлт явуулж чадахгүй — зөвхөн тайлан, мэдээлэл харна.
 */
export const READ_ONLY_ROLES = ['manager'] as const;

/** Зөвхөн харах хэрэглэгчид зөвшөөрөх бичих хүсэлтүүд (өөрийн төхөөрөмжийн мэдэгдлийн токен). */
const READ_ONLY_WRITE_ALLOWLIST = [/\/save-firebase-token$/, /\/device-tokens$/];

export const readOnlyRoleGuard: MiddlewareHandler = async (c, next) => {
  const currentUser = c.get('currentUser');
  const method = c.req.method.toUpperCase();

  if (
    currentUser &&
    (READ_ONLY_ROLES as readonly string[]).includes(currentUser.role) &&
    !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
    !READ_ONLY_WRITE_ALLOWLIST.some((pattern) => pattern.test(c.req.path))
  ) {
    throw new HTTPException(403, {
      message: 'Таны эрх зөвхөн харах (тайлан) эрх тул өөрчлөлт хийх боломжгүй.',
    });
  }

  await next();
};
