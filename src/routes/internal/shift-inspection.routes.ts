import {
  checkExistingShiftInspection,
  createShiftInspection,
  createShiftInspectionsBulk,
  updateShiftInspectionPhoto,
} from '$/context/inspection';
import {
  getShiftInspections,
  getShiftByPk,
  getVehicleInspectionSummary,
  getVehicleInspectionSummaryCount,
  getVehicleInspectionsByShift,
} from '$/context/shift';
import {
  enumShiftInspectionStatus,
  enumShiftType,
  enumVehicleType,
} from '$/libs/database/schema';
import { rbac } from '$/middlewares/rbac.middleware';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import { supabaseServer } from '$/server/supabase';
import type { AppEnv } from '$/utils/app-env';
import { Forbidden } from '$/utils/errors';
import { randomUUID } from 'crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { File } from 'node:buffer';
import { z } from 'zod';

const inspectionRoutes = new Hono<AppEnv>()
  .get(
    'shift-inspections/summary',
    rbac({ roles: ['markscheider', 'dispatcher', 'ita', 'mechanic', 'admin'] }),
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number(),
        offset: z.coerce.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        vehicleType: z.enum(enumVehicleType.enumValues).optional(),
        vehicleOrganizationId: z.string().uuid().optional(),
        vehicleId: z.string().optional(),
        shiftType: z.enum(enumShiftType.enumValues).optional(),
        driverId: z.string().optional(),
      })
    ),
    async (c) => {
      const currentUser = c.get('currentUser');
      const {
        limit,
        offset,
        startDate,
        endDate,
        vehicleType,
        vehicleOrganizationId,
        vehicleId,
        shiftType,
        driverId,
      } = c.req.valid('query');

      if (!currentUser.organizationId) {
        throw new Forbidden();
      }

      const data = await getVehicleInspectionSummary(
        {
          limit,
          offset,
        },
        {
          organizationId: currentUser.organizationId,
          startDate,
          endDate,
          vehicleType,
          vehicleOrganizationId,
          vehicleId,
          shiftType,
          driverId,
        }
      );

      const totalCount = await getVehicleInspectionSummaryCount({
        organizationId: currentUser.organizationId,
        startDate,
        endDate,
        vehicleType,
        vehicleOrganizationId,
        vehicleId,
        shiftType,
        driverId,
      });

      return c.json(data, {
        headers: {
          'X-Total-Count': totalCount.toString() || '0',
        },
      });
    }
  )
  .get(
    'shift-inspections',
    rbac({ roles: ['markscheider', 'dispatcher', 'ita', 'mechanic', 'admin'] }),
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number(),
        offset: z.coerce.number(),
        vehicleId: z.string(),
        vehicleType: z.enum(enumVehicleType.enumValues).optional(),
        status: z.enum(enumShiftInspectionStatus.enumValues).optional(),
      })
    ),
    async (c) => {
      const currentUser = c.get('currentUser');

      if (!currentUser.organizationId) {
        throw new Forbidden();
      }

      const { limit, offset, ...rest } = c.req.valid('query');

      const data = await getVehicleInspectionsByShift(
        {
          limit,
          offset,
        },
        {
          ...rest,
          organizationId: currentUser.organizationId,
        }
      );

      return c.json(data, {
        headers: {
          'X-Total-Count': data[0]?.totalCount.toString() || '0',
        },
      });
    }
  )

  .post('/inspection/upload-image', async (c) => {
    try {
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      // Parse the body
      const formData = await c.req.parseBody();

      // Get the file from form data
      const file = formData['file'] || formData.file;

      if (!file) {
        throw new HTTPException(400, { message: 'No file found in request' });
      }

      if (!(file instanceof File)) {
        throw new HTTPException(400, {
          message: `Expected File, got ${typeof file}`,
        });
      }

      // Validate file type
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

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new HTTPException(400, {
          message: 'File size too large. Maximum size is 10MB.',
        });
      }

      const ext = file.name.split('.').pop();
      const path = `inspections/${randomUUID()}.${ext}`;

      const buffer = Buffer.from(await file.arrayBuffer());

      const { error } = await supabaseServer.storage
        .from('inspection-images')
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
        .from('inspection-images')
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
  })
  .post(
    '/shift-inspection',
    zValidator(
      'json',
      z.object({
        vehicleId: z.string(),
        inspectionId: z.string(),
        status: z.enum(enumShiftInspectionStatus.enumValues),
        shiftId: z.string().optional(),
        notes: z.string().optional(),
        photoUrl: z.string().optional(),
      })
    ),
    async (c) => {
      const body = c.req.valid('json');

      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      if (body.shiftId) {
        const shift = await getShiftByPk(body.shiftId);

        if (!shift) {
          throw new HTTPException(422, {
            message: 'Ажлын ээлж олдсонгүй.',
          });
        }

        if (shift.driverId !== user.id) {
          throw new HTTPException(403, {
            message: 'Жолоочийн ээлжийн ажил биш.',
          });
        }
      }

      const vehicleInspection = await createShiftInspection({
        ...body,
        driverId: user.id,
      });

      return c.json(vehicleInspection);
    }
  )
  .post(
    '/shift-inspections/bulk',
    zValidator(
      'json',
      z.object({
        vehicleId: z.string().uuid(),
        shiftId: z.string().uuid().optional(),
        inspections: z.array(
          z.object({
            inspectionId: z.string().uuid(),
            status: z.enum(enumShiftInspectionStatus.enumValues),
            notes: z.string().optional(),
            photoUrl: z.string().optional(),
          })
        ),
      })
    ),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      if (body.shiftId) {
        const shift = await getShiftByPk(body.shiftId);

        if (!shift) {
          throw new HTTPException(422, {
            message: 'Ажлын ээлж олдсонгүй.',
          });
        }

        if (shift.driverId !== user.id) {
          throw new HTTPException(403, {
            message: 'Жолоочийн ээлжийн ажил биш.',
          });
        }

        const existingShiftInspection = await checkExistingShiftInspection({
          shiftId: body.shiftId,
          shiftInspectionIds: body.inspections.map((i) => i.inspectionId),
        });

        if (existingShiftInspection !== null) {
          throw new HTTPException(422, {
            message: 'Үзлэг аль хэдий нь нэмсэн байна.',
          });
        }
      }

      const shiftInspections = await createShiftInspectionsBulk(
        body.inspections.map((inspection) => ({
          shiftId: body.shiftId,
          vehicleId: body.vehicleId,
          inspectionId: inspection.inspectionId,
          driverId: user.id,
          status: inspection.status,
          notes: inspection.notes,
          photoUrl: inspection.photoUrl,
        }))
      );

      return c.json(shiftInspections, 201);
    }
  )
  .put(
    '/shift-inspection/:id/photo',
    zValidator(
      'json',
      z.object({
        photoUrl: z.string().url(),
      })
    ),
    async (c) => {
      const { id } = c.req.param();
      const { photoUrl } = c.req.valid('json');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const updatedInspection = await updateShiftInspectionPhoto(id, photoUrl);

      if (!updatedInspection) {
        throw new HTTPException(404, {
          message: 'Shift inspection not found',
        });
      }

      return c.json(updatedInspection);
    }
  );

export default inspectionRoutes;
