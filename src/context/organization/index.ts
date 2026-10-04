import { drizzleDb } from '$/libs/database/db';
import { organizations, users } from '$/libs/database/schema';
import {
  first,
  firstOrNull,
  type PaginationType,
} from '$/libs/database/utils';
import { desc, eq, sql } from 'drizzle-orm';

export const getOrganizationByName = async (name: string) => {
  return firstOrNull(
    await drizzleDb
      .select()
      .from(organizations)
      .where(eq(organizations.name, name))
  );
};

export const getOrganizationBySubdomain = async (
  subdomain: string
) => {
  const normalized = subdomain.trim().toLowerCase();

  return firstOrNull(
    await drizzleDb
      .select()
      .from(organizations)
      .where(
        sql`LOWER(${organizations.subdomain}) = ${normalized}`
      )
  );
};

export const getOrganizationByPk = async (id: string) => {
  return firstOrNull(
    await drizzleDb
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
  );
};

type OrgInput = {
  name: string;
  subdomain: string;
  code?: string;
  contactEmail?: string;
  contactPhone?: string;
  logoUrl?: string | null;
};

export const createOrganization = async (
  input: OrgInput
) => {
  return first(
    await drizzleDb
      .insert(organizations)
      .values({
        ...input,
        subdomain: input.subdomain
          .trim()
          .toLowerCase(),
        logoUrl: input.logoUrl?.trim() || null,
      })
      .returning()
  );
};

/**
 * Байгууллагын лого солих / устгах.
 *
 * logoUrl = null -> лого устгана.
 * updatedAt нь schema-ийн $onUpdate-оор автоматаар шинэчлэгдэнэ.
 */
export const updateOrganizationLogo = async (
  id: string,
  logoUrl: string | null
) => {
  return firstOrNull(
    await drizzleDb
      .update(organizations)
      .set({
        logoUrl: logoUrl?.trim() || null,
      })
      .where(eq(organizations.id, id))
      .returning()
  );
};

export const getOrganizations = async ({
  limit,
  offset,
}: PaginationType) => {
  return drizzleDb
    .select()
    .from(organizations)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(organizations.createdAt));
};

export const deactivateOrganization = async (
  id: string
) => {
  await drizzleDb
    .update(users)
    .set({
      status: 'inactive',
    })
    .where(eq(users.organizationId, id));

  return drizzleDb
    .update(organizations)
    .set({
      deactivatedAt: new Date().toISOString(),
    })
    .where(eq(organizations.id, id))
    .returning();
};