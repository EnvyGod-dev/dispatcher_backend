import {
  createBulkUsers,
  createUser,
  getEmployeeCount,
  getEmployees,
  getUserByPhoneNumber,
  getUserByPk,
  updateUser,
} from '$/context/user';
import {
  account,
  enumDriverShiftGroup,
  enumUserRole,
  enumUserStatus,
  session,
} from '$/libs/database/schema';
import { emailService } from '$/libs/mailer';
import { rbac } from '$/middlewares/rbac.middleware';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import { supabaseServer } from '$/server/supabase';
import type { AppEnv } from '$/utils/app-env';
import { ClientError, Forbidden } from '$/utils/errors';
import logger from '$/utils/logger';
import { randomUUID } from 'crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { File } from 'node:buffer';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import type { User } from '$/context/user/types';
import { drizzleDb } from '$/libs/database/db';
import { eq } from 'drizzle-orm';
import { hashPassword } from '$/server/hash-utils';

const userManagementRoute = new Hono<AppEnv>()
  .get(
    '/employees',
    rbac({ roles: ['hr', 'admin', 'dispatcher', 'superadmin'] }),
    zValidator(
      'query',
      z.object({
        offset: z.coerce.number().default(1),
        limit: z.coerce.number().default(35),
        organizationId: z.coerce.string().optional(),
        status: z.enum(enumUserStatus.enumValues).optional(),
        role: z.enum(enumUserRole.enumValues).optional(),
        driverShiftGroup: z.enum(enumDriverShiftGroup.enumValues).optional(),
        name: z.string().optional(),
      }),
    ),
    async (c) => {
      const { limit, offset, status, role, driverShiftGroup, name } =
        c.req.valid('query');

      const user = c.get('currentUser');

      if (user.role !== 'superadmin' && !user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const employees = await getEmployees(
        { limit, offset },
        {
          organizationId:
            user.role === 'superadmin' ? undefined : user.organizationId,
          excludeRole: user.role === 'admin' ? 'superadmin' : undefined,
          includeRole: user.role === 'superadmin' ? 'admin' : undefined,
          role,
          driverShiftGroup,
          currentUserId: user.id,
          status,
          name,
        },
      );

      const totalCount = await getEmployeeCount({
        organizationId: user.organizationId,
        excludeRole: user.role === 'admin' ? 'superadmin' : undefined,
        includeRole: user.role === 'superadmin' ? 'admin' : undefined,
        role,
        driverShiftGroup,
        currentUserId: user.id,
        status,
        name,
      });

      return c.json(employees, {
        headers: {
          'X-Total-Count': totalCount.toString(),
        },
      });
    },
  )
  .post(
    '/register-user',
    rbac({ roles: ['hr', 'admin', 'superadmin'] }),
    zValidator(
      'json',
      z.object({
        phone: z.number(),
        password: z.string().trim(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        role: z.enum(enumUserRole.enumValues),
        email: z.string().email().optional(),
        imageUrl: z.string().url().optional(),
        organizationId: z.string().optional(),

        position: z.string().optional(),
        department: z.string().optional().nullable(),
        registerNumber: z.string().optional().nullable(),
        driverLicenseExpiryDate: z.string().optional().nullable(),
        ettDriverLicenseExpiryDate: z.string().optional().nullable(),
        entryPermitExpiryDate: z.string().optional().nullable(),

        driverShiftGroup: z.enum(enumDriverShiftGroup.enumValues).optional(),
      })
    ),
    async (c) => {
      const input = c.req.valid('json');
      const currentUser = c.get('currentUser');

      if (
        ['driver', 'assistant_operator'].includes(input.role) &&
        !input.driverShiftGroup
      ) {
        throw new ClientError('Операторт ABCD ээлж шаардлагатай');
      }

      if (currentUser.role !== 'superadmin' && !currentUser.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      if (currentUser.role !== 'superadmin' && input.role === 'admin') {
        throw new HTTPException(403, {
          message: 'Бүртгэл үүсгэх эрхгүй',
        });
      }

      if (currentUser.role === 'superadmin' && !input.organizationId) {
        throw new ClientError('Байгууллага шаардлагатай');
      }

      const orgId =
        currentUser.role === 'superadmin'
          ? input.organizationId
          : currentUser.organizationId;

      if (!orgId) {
        throw new HTTPException(400, {
          message: 'Байгууллагын мэдээлэл шаардлагатай',
        });
      }

      const existing = await getUserByPhoneNumber(input.phone);

      if (existing) {
        throw new ClientError('Бүртгэлтэй хэрэглэгч байна.');
      }

      const user = await createUser({
        ...input,
        username: input.phone,
        organizationId: orgId,
      });

      logger.info({
        event: 'user-created',
        data: {
          user,
          pass: input.password,
        },
      });

      const emailSent = await emailService.sendWelcomeEmail(
        user.firstName,
        user.lastName,
        user.email,
        input.phone.toString(),
        input.password,
      );

      if (!emailSent) {
        logger.warn({
          event: 'welcome-email-failed',
          data: {
            userId: user.id,
            email: user.email,
          },
        });
      }

      return c.json(
        {
          success: true,
          data: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            organizationId: orgId,
          },
        },
        201,
      );
    },
  )
  .post(
    '/register-user/bulk',
    rbac({ roles: ['admin', 'hr', 'superadmin'] }),
    async (c) => {
      const currentUser = c.get('currentUser');

      if (!currentUser.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const body = await c.req.parseBody();
      const file = (body['file'] as File) || body.file;

      if (!file) {
        throw new HTTPException(400, {
          message: 'Файл оруулна уу.',
        });
      }

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0] as string;
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        throw new HTTPException(400, {
          message: 'Файл уншихад алдаа гарлаа.',
        });
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet) as User[];

      console.log(jsonData, 'json data');

      const results = await createBulkUsers({
        jsonData: jsonData,
        organizationId: currentUser.organizationId,
      });

      return c.json(results);
    },
  )
  .post(
    '/employee-status',
    rbac({ roles: ['hr', 'admin', 'superadmin'] }),
    zValidator(
      'json',
      z.object({
        userId: z.string(),
        status: z.enum(enumUserStatus.enumValues),
      }),
    ),
    async (c) => {
      const input = c.req.valid('json');
      const currentUser = c.get('currentUser');

      const user = await getUserByPk(input.userId);

      if (!user) {
        throw new HTTPException(422, {
          message: 'User not found',
        });
      }

      if (user.organizationId !== currentUser.organizationId) {
        throw new HTTPException(422, {
          message: 'User not found',
        });
      }

      const updated = await updateUser(input.userId, input);

      return c.json(updated);
    },
  )
  .put(
    '/user/driver-shift-group',
    rbac({ roles: ['dispatcher', 'hr', 'admin', 'superadmin'] }),
    zValidator(
      'json',
      z.object({
        userId: z.string(),
        driverShiftGroup: z.enum(enumDriverShiftGroup.enumValues),
      }),
    ),
    async (c) => {
      const input = c.req.valid('json');
      const currentUser = c.get('currentUser');

      const user = await getUserByPk(input.userId);

      if (!user) {
        throw new HTTPException(404, {
          message: 'User not found',
        });
      }

      if (currentUser.role !== 'superadmin') {
        if (
          !currentUser.organizationId ||
          user.organizationId !== currentUser.organizationId
        ) {
          throw new HTTPException(403, {
            message: 'Unauthorized',
          });
        }
      }

      const updated = await updateUser(input.userId, {
        driverShiftGroup: input.driverShiftGroup,
      });

      return c.json(updated);
    },
  )
  .delete(
    '/employee',
    rbac({ roles: ['hr', 'admin', 'superadmin'] }),
    zValidator(
      'json',
      z.object({
        userId: z.string(),
      }),
    ),
    async (c) => {
      const input = c.req.valid('json');
      const currentUser = c.get('currentUser');

      const user = await getUserByPk(input.userId);

      if (!user) {
        throw new HTTPException(422, {
          message: 'User not found',
        });
      }

      if (user.organizationId !== currentUser.organizationId) {
        throw new HTTPException(422, {
          message: 'User not found',
        });
      }

      const updated = await updateUser(input.userId, {
        status: 'inactive',
        deletedAt: new Date().toISOString(),
        username: `${user.username}_deprecated`,
        email: user.email ? `${user.email}_deprecated` : undefined,
      });

      if (user) {
        const deleted = await drizzleDb.transaction(async (tx) => {
          const deletedAccount = await tx
            .delete(account)
            .where(eq(account.userId, updated.id));
          const deletedSession = await tx
            .delete(session)
            .where(eq(session.userId, updated.id));

          return { deletedAccount, deletedSession };
        });

        logger.info({
          event: 'delete-user',
          data: {
            deleted,
          },
        });
      }

      return c.json(updated);
    },
  )

  .put(
    '/user',
    rbac({ roles: ['hr', 'admin', 'superadmin'] }),
    zValidator(
      'json',
      z.object({
        userId: z.string(),

        firstName: z.string().optional(),
        lastName: z.string().optional(),

        role: z.enum(enumUserRole.enumValues).optional(),

        email: z.string().optional(),

        imageUrl: z.string().url().optional(),

        position: z.string().optional(),

        department: z.string().nullable().optional(),

        registerNumber: z.string().nullable().optional(),

        driverLicenseExpiryDate: z.string().nullable().optional(),

        ettDriverLicenseExpiryDate: z.string().nullable().optional(),

        entryPermitExpiryDate: z.string().nullable().optional(),

        driverShiftGroup: z
          .enum(enumDriverShiftGroup.enumValues)
          .nullable()
          .optional(),
      }),
    ),
    async (c) => {
      const input = c.req.valid('json');
      const currentUser = c.get('currentUser');

      const targetUser = await getUserByPk(input.userId);

      if (!targetUser) {
        throw new HTTPException(404, {
          message: 'User not found',
        });
      }

      const nextRole = input.role ?? targetUser.role;

      const nextDriverShiftGroup =
        input.driverShiftGroup !== undefined
          ? input.driverShiftGroup
          : targetUser.driverShiftGroup;

      if (
        ['driver', 'assistant_operator'].includes(nextRole) &&
        !nextDriverShiftGroup
      ) {
        throw new ClientError('Операторт ABCD ээлж шаардлагатай');
      }

      const updated = await updateUser(input.userId, {
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        email: input.email,
        imageUrl: input.imageUrl,
        position: input.position,

        department: input.department,

        registerNumber: input.registerNumber,

        driverLicenseExpiryDate: input.driverLicenseExpiryDate,

        ettDriverLicenseExpiryDate:
          input.ettDriverLicenseExpiryDate,

        entryPermitExpiryDate:
          input.entryPermitExpiryDate,

        driverShiftGroup: input.driverShiftGroup,
      });

      return c.json(updated);
    },
  )

  .post(
    '/user/upload-image',
    rbac({ roles: ['hr', 'admin', 'superadmin'] }),
    async (c) => {
      try {
        const formData = await c.req.parseBody();

        const file = formData['file'] || formData.file;

        if (!file) {
          throw new HTTPException(400, { message: 'No file found in request' });
        }

        if (!(file instanceof File)) {
          throw new HTTPException(400, {
            message: `Expected File, got ${typeof file}`,
          });
        }

        const allowedTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
        ];

        if (!allowedTypes.includes(file.type)) {
          throw new HTTPException(400, {
            message:
              'Invalid file type. Only JPEG, PNG, and WebP images are allowed.',
          });
        }

        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
          throw new HTTPException(400, {
            message: 'File size too large. Maximum size is 10MB.',
          });
        }

        const ext = file.name.split('.').pop();
        const path = `users/${randomUUID()}.${ext}`;

        const buffer = Buffer.from(await file.arrayBuffer());

        const { error } = await supabaseServer.storage
          .from('user-images')
          .upload(path, buffer, {
            contentType: file.type,
            upsert: false,
          });

        if (error) {
          console.error('Supabase upload error:', error);
          throw new HTTPException(500, {
            message: `Upload failed: ${error.message}`,
          });
        }

        const { data } = supabaseServer.storage
          .from('user-images')
          .getPublicUrl(path);

        return c.json({ url: data.publicUrl });
      } catch (error) {
        console.error('Upload error:', error);

        if (error instanceof HTTPException) {
          throw error;
        }

        throw new HTTPException(500, {
          message: 'Internal server error during file upload',
        });
      }
    },
  )

  .put(
    '/change-password',
    rbac({ roles: ['hr', 'admin', 'superadmin'] }),
    zValidator(
      'json',
      z.object({
        userId: z.string().uuid('Invalid user ID'),
        newPassword: z
          .string()
          .min(6, 'Password must be at least 6 characters'),
      }),
    ),
    async (c) => {
      const { userId, newPassword } = c.req.valid('json');
      const currentUser = c.get('currentUser');

      const targetUser = await getUserByPk(userId);

      if (!targetUser) {
        throw new HTTPException(404, {
          message: 'User not found',
        });
      }

      if (currentUser.role === 'admin') {
        if (targetUser.organizationId !== currentUser.organizationId) {
          throw new HTTPException(403, {
            message:
              'Cannot change password for users outside your organization',
          });
        }

        if (targetUser.role === 'superadmin') {
          throw new HTTPException(403, {
            message: 'Cannot change password for superadmin users',
          });
        }
      }

      if (targetUser.status === 'inactive') {
        throw new HTTPException(400, {
          message: 'Cannot change password for inactive user',
        });
      }

      try {
        const hashedPassword = await hashPassword(newPassword);

        await drizzleDb.transaction(async (tx) => {
          await tx
            .update(account)
            .set({
              password: hashedPassword,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(account.userId, userId));
        });

        logger.info({
          event: 'admin-password-change',
          data: {
            adminId: currentUser.id,
            targetUserId: userId,
            targetUserOrganization: targetUser.organizationId,
          },
        });

        return c.json({
          success: true,
          message: 'Password changed successfully',
        });
      } catch (error) {
        logger.error({
          event: 'admin-password-change-error',
          data: {
            error,
            adminId: currentUser.id,
            targetUserId: userId,
          },
        });

        throw new HTTPException(500, {
          message: 'Failed to change password',
        });
      }
    },
  );

export default userManagementRoute;