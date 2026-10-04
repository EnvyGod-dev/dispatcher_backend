import {
  createOrganization,
  deactivateOrganization,
  getOrganizationByName,
  getOrganizationBySubdomain,
  getOrganizations,
} from '$/context/organization';
import { drizzleDb } from '$/libs/database/db';
import { organizations } from '$/libs/database/schema';
import { first } from '$/libs/database/utils';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import { ClientError } from '$/utils/errors';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

const RESERVED_SUBDOMAINS = [
  'www',
  'api',
  'admin',
  'log',
  'mail',
];

const subdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Вэб хаяг оруулна уу.')
  .max(63, 'Вэб хаяг хамгийн ихдээ 63 тэмдэгт байна.')
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'Вэб хаяг зөвхөн a-z, 0-9 болон дундаа "-" тэмдэгт агуулна.'
  )
  .refine(
    (value) => !RESERVED_SUBDOMAINS.includes(value),
    'Энэ вэб хаягийг ашиглах боломжгүй.'
  );

/**
 * Лого зөвхөн манай R2 bucket-аас байх ёстой.
 * Client дурын гадны URL хадгалуулахаас сэргийлнэ.
 */
const R2_PUBLIC_URL = (
  process.env.CLOUDFLARE_R2_PUBLIC_URL || ''
).replace(/\/+$/, '');

/**
 * ''   -> null  (лого устгана)
 * null -> null
 * url  -> шалгаад хадгална
 */
const logoUrlSchema = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === ''
      ? null
      : value,
  z
    .string()
    .trim()
    .url('Логоны хаяг буруу байна.')
    .max(1024, 'Логоны хаяг хэт урт байна.')
    .refine(
      (url) => !R2_PUBLIC_URL || url.startsWith(`${R2_PUBLIC_URL}/`),
      'Лого зөвхөн системээр upload хийсэн зураг байх ёстой.'
    )
    .nullable()
);

const organizationManagementRoute = new Hono()
  .post(
    '/organization',
    zValidator(
      'json',
      z.object({
        name: z.string().trim().min(1, 'Байгууллагын нэр оруулна уу.'),
        subdomain: subdomainSchema,
        contactEmail: z.string(),
        code: z.string().optional(),
        contactPhone: z.string().optional(),
        logoUrl: logoUrlSchema.optional(),
      })
    ),
    async (c) => {
      const input = c.req.valid('json');

      const orgByName = await getOrganizationByName(input.name);

      if (orgByName) {
        throw new ClientError(
          'Ижилхэн нэртэй байгууллага бүртгэлтэй байна.'
        );
      }

      const orgBySubdomain = await getOrganizationBySubdomain(
        input.subdomain
      );

      if (orgBySubdomain) {
        throw new ClientError(
          'Энэ вэб хаягтай байгууллага бүртгэлтэй байна.'
        );
      }

      const organization = await createOrganization(input);

      return c.json(organization);
    }
  )

  .put(
    '/organization',
    zValidator(
      'json',
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).optional(),
        subdomain: subdomainSchema.optional(),
        code: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        /**
         * undefined -> логог өөрчлөхгүй
         * null / '' -> логог устгана
         * url       -> шинэ лого
         */
        logoUrl: logoUrlSchema.optional(),
      })
    ),
    async (c) => {
      const input = c.req.valid('json');
      const { id, ...changes } = input;

      /**
       * Зөвхөн ирсэн талбаруудыг шинэчилнэ.
       * Хоосон update drizzle дээр алдаа өгдөг.
       */
      const updates = Object.fromEntries(
        Object.entries(changes).filter(
          ([, value]) => value !== undefined
        )
      ) as typeof changes;

      if (Object.keys(updates).length === 0) {
        throw new ClientError('Өөрчлөх мэдээлэл ирээгүй байна.');
      }

      if (updates.subdomain) {
        const orgBySubdomain = await getOrganizationBySubdomain(
          updates.subdomain
        );

        if (orgBySubdomain && orgBySubdomain.id !== id) {
          throw new ClientError(
            'Энэ вэб хаягтай байгууллага бүртгэлтэй байна.'
          );
        }
      }

      if (updates.name) {
        const orgByName = await getOrganizationByName(updates.name);

        if (orgByName && orgByName.id !== id) {
          throw new ClientError(
            'Ижилхэн нэртэй байгууллага бүртгэлтэй байна.'
          );
        }
      }

      const updated = first(
        await drizzleDb
          .update(organizations)
          .set(updates)
          .where(eq(organizations.id, id))
          .returning()
      );

      return c.json(updated);
    }
  )

  .get(
    '/organizations',
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number().default(50),
        offset: z.coerce.number().default(0),
      })
    ),
    async (c) => {
      const { limit, offset } = c.req.valid('query');

      const organizations = await getOrganizations({
        limit,
        offset,
      });

      return c.json(organizations);
    }
  )

  .delete(
    '/organization',
    zValidator(
      'json',
      z.object({
        id: z.string().uuid(),
      })
    ),
    async (c) => {
      const { id } = c.req.valid('json');

      const deleted = await deactivateOrganization(id);

      return c.json(deleted !== null);
    }
  );

export default organizationManagementRoute;