import { drizzleDb } from '$/libs/database/db';
import {
  enumDriverShiftGroup,
  enumUserRole,
  organizations,
  users,
} from '$/libs/database/schema';
import {
  first,
  firstOrNull,
  type PaginationType,
} from '$/libs/database/utils';
import { auth } from '$/server/auth';
import logger from '$/utils/logger';
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNull,
  ne,
  or,
} from 'drizzle-orm';
import { getOrganizationByPk } from '../organization';
import type { User, UserRole } from './types';
import { ClientError } from '$/utils/errors';
import { z } from 'zod';

export const getUserByPhoneNumber = async (phone: number) => {
  return firstOrNull(
    await drizzleDb
      .select()
      .from(users)
      .where(and(eq(users.phoneNumber, phone), ne(users.status, 'inactive')))
  );
};

export const getUserByPk = async (id: string) => {
  return firstOrNull(
    await drizzleDb
      .select({
        ...getTableColumns(users),
        organization: getTableColumns(organizations),
      })
      .from(users)
      .leftJoin(
        organizations,
        eq(users.organizationId, organizations.id)
      )
      .where(eq(users.id, id))
  );
};

type CreateUserInput = {
  username: number;
  phone: number;
  password: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  imageUrl?: string;
  position?: string;
  department?: string | null;
  registerNumber?: string | null;
  driverLicenseExpiryDate?: string | null;
  ettDriverLicenseExpiryDate?: string | null;
  entryPermitExpiryDate?: string | null;
  driverShiftGroup?: (typeof enumDriverShiftGroup.enumValues)[number];
};

export const createUser = async ({
  firstName,
  lastName,
  organizationId,
  role,
  imageUrl,
  phone,
  password,
  email,
  position,
  driverShiftGroup,
  department,
  registerNumber,
  driverLicenseExpiryDate,
  ettDriverLicenseExpiryDate,
  entryPermitExpiryDate,
}: CreateUserInput) => {
  const organization = await getOrganizationByPk(organizationId);

  if (!organization) {
    throw new ClientError('Байгууллага олдсонгүй.');
  }

  try {
    const data = await auth.api.signUpEmail({
      body: {
        email: email ? email : `${phone.toString()}@internal.local`,
        name: firstName,
        password,
        username: phone.toString(),
        role,
        isActive: true,
      } as any,
    });

    if (data) {
      await drizzleDb
        .update(users)
        .set({
          username: phone.toString(),
          phoneNumber: phone,
          firstName,
          lastName,
          position,
          role,
          imageUrl,
          organizationId,
          email,
          driverShiftGroup,
          department,
          registerNumber,
          driverLicenseExpiryDate,
          ettDriverLicenseExpiryDate,
          entryPermitExpiryDate,
          isActive: true,
        })
        .where(eq(users.id, data.user.id));
    }

    return {
      ...data?.user,
      firstName,
      lastName,
    };
  } catch (error: any) {
    if (error.body?.code) {
      throw new ClientError(error.message);
    }

    logger.warn({
      event: 'create-user',
      data: { error },
    });

    throw new ClientError(error.message);
  }
};

export const getUserByEmail = async (email: string) => {
  return firstOrNull(
    await drizzleDb
      .select()
      .from(users)
      .where(eq(users.email, email))
  );
};

export type UserStatus =
  | 'available'
  | 'resting'
  | 'sick_leave'
  | 'on_leave'
  | 'inactive';

type EmployeeFilter = {
  organizationId?: string | null;
  excludeRole?: UserRole;
  includeRole?: UserRole;
  role?: UserRole;
  driverShiftGroup?: (typeof enumDriverShiftGroup.enumValues)[number];
  status?: UserStatus;

  // Ерөнхий search
  name?: string;

  currentUserId: string;
};

/**
 * Search string-ийг:
 *
 * " Бат   Болд "
 *
 * =>
 *
 * ["Бат", "Болд"]
 *
 * болгоно.
 */
const normalizeSearchTerms = (value?: string) => {
  if (!value) {
    return [];
  }

  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
};

/**
 * Нэг search input-аас:
 *
 * - Нэр
 * - Овог
 * - Email
 * - Хэлтэс
 * - Регистр
 * - Албан тушаал
 *
 * хайна.
 *
 * Search олон үгтэй бол үг бүр employee-ийн аль нэг
 * searchable field дээр таарах ёстой.
 *
 * Ж:
 *
 * "Бат Болд"
 *
 * =>
 *
 * (
 *   firstName ILIKE '%Бат%'
 *   OR lastName ILIKE '%Бат%'
 *   OR ...
 * )
 * AND
 * (
 *   firstName ILIKE '%Болд%'
 *   OR lastName ILIKE '%Болд%'
 *   OR ...
 * )
 */
const buildEmployeeSearchCondition = (search?: string) => {
  const terms = normalizeSearchTerms(search);

  if (terms.length === 0) {
    return undefined;
  }

  const termConditions = terms.map((term) => {
    const pattern = `%${term}%`;

    return or(
      ilike(users.firstName, pattern),
      ilike(users.lastName, pattern),
      ilike(users.email, pattern),
      ilike(users.department, pattern),
      ilike(users.registerNumber, pattern),
      ilike(users.position, pattern)
    );
  });

  return and(...termConditions);
};

export const getEmployees = async (
  { limit, offset }: PaginationType,
  filter: EmployeeFilter
) => {
  const conditions = [];

  if (filter.organizationId) {
    conditions.push(
      eq(users.organizationId, filter.organizationId)
    );
  }

  if (filter.excludeRole) {
    conditions.push(
      ne(users.role, filter.excludeRole)
    );
  }

  if (filter.includeRole) {
    conditions.push(
      eq(users.role, filter.includeRole)
    );
  }

  if (filter.role) {
    conditions.push(
      eq(users.role, filter.role)
    );
  }

  if (filter.driverShiftGroup) {
    conditions.push(
      eq(users.driverShiftGroup, filter.driverShiftGroup)
    );
  }

  if (filter.status) {
    conditions.push(
      eq(users.status, filter.status)
    );
  }

  const searchCondition =
    buildEmployeeSearchCondition(filter.name);

  if (searchCondition) {
    conditions.push(searchCondition);
  }

  conditions.push(
    ne(users.id, filter.currentUserId)
  );

  conditions.push(
    isNull(users.deletedAt)
  );

  return drizzleDb
    .select({
      ...getTableColumns(users),
      organization: getTableColumns(organizations),
    })
    .from(users)
    .leftJoin(
      organizations,
      eq(
        organizations.id,
        users.organizationId
      )
    )
    .where(
      conditions.length > 0
        ? conditions.length === 1
          ? conditions[0]
          : and(...conditions)
        : undefined
    )
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);
};

export const getEmployeeCount = async ({
  organizationId,
  excludeRole,
  includeRole,
  role,
  driverShiftGroup,
  currentUserId,
  status,
  name,
}: EmployeeFilter) => {
  const conditions = [];

  if (organizationId) {
    conditions.push(
      eq(users.organizationId, organizationId)
    );
  }

  if (excludeRole) {
    conditions.push(
      ne(users.role, excludeRole)
    );
  }

  if (includeRole) {
    conditions.push(
      eq(users.role, includeRole)
    );
  }

  if (role) {
    conditions.push(
      eq(users.role, role)
    );
  }

  if (driverShiftGroup) {
    conditions.push(
      eq(users.driverShiftGroup, driverShiftGroup)
    );
  }

  if (status) {
    conditions.push(
      eq(users.status, status)
    );
  }

  const searchCondition =
    buildEmployeeSearchCondition(name);

  if (searchCondition) {
    conditions.push(searchCondition);
  }

  conditions.push(
    ne(users.id, currentUserId)
  );

  conditions.push(
    isNull(users.deletedAt)
  );

  const query = firstOrNull(
    await drizzleDb
      .select({
        count: count(),
      })
      .from(users)
      .where(
        conditions.length > 0
          ? conditions.length === 1
            ? conditions[0]
            : and(...conditions)
          : undefined
      )
  );

  return query === null
    ? 0
    : query.count;
};

type UpdateUserInput =
  Partial<typeof users.$inferInsert>;

export const updateUser = async (
  id: string,
  input: UpdateUserInput
) => {
  return first(
    await drizzleDb
      .update(users)
      .set({
        ...input,
      })
      .where(eq(users.id, id))
      .returning()
  );
};

export const createBulkUsers = async ({
  jsonData,
  organizationId,
}: {
  jsonData: User[];
  organizationId: string;
}) => {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as Array<{
      row: number;
      error: string;
      data: any;
    }>,
  };

  const validUsers: Array<{
    firstName: string;
    lastName: string;
    phoneNumber: number;
    password: string;
    email?: string;
    role: UserRole;
    position?: string;
    department?: string | null;
    registerNumber?: string | null;
    driverLicenseExpiryDate?: string | null;
    ettDriverLicenseExpiryDate?: string | null;
    entryPermitExpiryDate?: string | null;
    driverShiftGroup?: (
      typeof enumDriverShiftGroup.enumValues
    )[number];
  }> = [];

  for (
    let i = 0;
    i < jsonData.length;
    i++
  ) {
    const row: any = jsonData[i];
    const rowNumber = i + 2;

    try {
      const validationSchema = z.object({
        role: z.enum(
          enumUserRole.enumValues,
          {
            errorMap: () => ({
              message: 'Invalid role',
            }),
          }
        ),

        phoneNumber: z.coerce
          .number()
          .min(
            10000000,
            'Утасны дугаар буруу'
          ),

        password: z.coerce
          .string()
          .min(
            1,
            'Нууц үг шаардлагатай'
          ),

        firstName: z
          .string()
          .min(
            1,
            'Нэр шаардлагатай'
          ),

        lastName: z
          .string()
          .min(
            1,
            'Овог шаардлагатай'
          ),

        email: z
          .string()
          .email()
          .optional(),

        position: z
          .string()
          .optional(),

        department: z
          .string()
          .optional()
          .nullable(),

        registerNumber: z
          .string()
          .optional()
          .nullable(),

        driverLicenseExpiryDate: z
          .string()
          .optional()
          .nullable(),

        ettDriverLicenseExpiryDate: z
          .string()
          .optional()
          .nullable(),

        entryPermitExpiryDate: z
          .string()
          .optional()
          .nullable(),

        driverShiftGroup: z
          .enum(
            enumDriverShiftGroup.enumValues
          )
          .optional(),
      });

      const validated =
        validationSchema.parse(row);

      if (
        [
          'driver',
          'assistant_operator',
        ].includes(
          validated.role
        ) &&
        !validated.driverShiftGroup
      ) {
        throw new ClientError(
          'driverShiftGroup шаардлагатай'
        );
      }

      validUsers.push(validated);
    } catch (error) {
      results.failed++;

      results.errors.push({
        row: rowNumber,

        error:
          error instanceof z.ZodError
            ? error.errors
                .map(
                  (e) =>
                    `${e.path.join('.')}: ${e.message}`
                )
                .join(', ')
            : 'Алдаатай өгөгдөл',

        data: row,
      });
    }
  }

  if (validUsers.length > 0) {
    try {
      for (
        const [
          idx,
          userData,
        ] of validUsers.entries()
      ) {
        const rowNumber =
          idx + 2;

        try {
          const existing =
            await getUserByPhoneNumber(
              userData.phoneNumber
            );

          if (existing) {
            results.failed++;

            results.errors.push({
              row: rowNumber,
              error:
                'Бүртгэлтэй хэрэглэгч байна',
              data: userData,
            });

            continue;
          }

          const created =
            await createUser({
              username:
                userData.phoneNumber,

              phone:
                userData.phoneNumber,

              password:
                userData.password,

              firstName:
                userData.firstName,

              lastName:
                userData.lastName,

              organizationId,

              role:
                userData.role,

              email:
                userData.email,

              position:
                userData.position,

              department:
                userData.department,

              registerNumber:
                userData.registerNumber,

              driverLicenseExpiryDate:
                userData.driverLicenseExpiryDate,

              ettDriverLicenseExpiryDate:
                userData.ettDriverLicenseExpiryDate,

              entryPermitExpiryDate:
                userData.entryPermitExpiryDate,

              driverShiftGroup:
                userData.driverShiftGroup,
            });

          if (created) {
            results.success++;
          }
        } catch (userError) {
          results.failed++;

          results.errors.push({
            row: rowNumber,

            error:
              userError instanceof Error
                ? userError.message
                : 'Хэрэглэгч үүсгэхэд алдаа гарлаа',

            data: userData,
          });
        }
      }
    } catch (error) {
      logger.error({
        event:
          'bulk-user-creation-error',
        data: {
          error,
        },
      });

      throw new ClientError(
        'Хэрэглэгчид үүсгэхэд алдаа гарлаа'
      );
    }
  }

  return results;
};
