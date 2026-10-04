import {
  createVehicle,
  deleteVehicle,
  getVehicleByPk,
  updateVehicle,
} from '$/context/vehicle';
import { drizzleDb } from '$/libs/database/db';
import {
  enumVehiclePictureAngle,
  enumVehicleStatus,
  enumVehicleType,
  vehiclePictures,
} from '$/libs/database/schema';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import { supabaseServer } from '$/server/supabase';
import type { AppEnv } from '$/utils/app-env';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { File } from 'node:buffer';
import { z } from 'zod';

const nullableVehicleFields = [
  'vehicleNumber',
  'serialNumber',
  'engineNumber',
  'vehicleOrganizationId',
  'miningSectionId',
  'mineNumber',
  'soilCoefficient',
  'coalCoefficient',
  'commissioningDate',
  'insuranceExpiryDate',
  'decommissioningDate',
  'stoppedMotoHours',
  'gpsId',
  'gpsGroupId',
  'gpsName',
  'fuelConsumptionPerHour',
  'notes',
] as const;

const normalizeVehicleInput = <T extends Record<string, unknown>>(
  input: T,
  emptyValue: null | undefined
) => {
  const normalized: Record<string, unknown> = { ...input };

  for (const field of nullableVehicleFields) {
    if (normalized[field] === '') {
      normalized[field] = emptyValue;
    }
  }

  return normalized as T;
};

const vehicleRoutes = new Hono<AppEnv>()
  .post('/vehicle/upload-image', async (c) => {
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
      const path = `vehicles/${randomUUID()}.${ext}`;

      const buffer = Buffer.from(await file.arrayBuffer());

      const { error } = await supabaseServer.storage
        .from('vehicle-images')
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
        .from('vehicle-images')
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
    '/vehicle',
    zValidator(
      'json',
      z.object({
        name: z.string(),
        code: z.string(),
        vehicleNumber: z.string(),
        serialNumber: z.string(),
        engineNumber: z.string(),
        vehicleOrganizationId: z.string(),
        miningSectionId: z.string(),
        mineNumber: z.string(),
        type: z.enum(enumVehicleType.enumValues),
        soilCoefficient: z.string(),
        coalCoefficient: z.string(),
        commissioningDate: z.string().optional(),
        insuranceExpiryDate: z.string().optional(),
        decommissioningDate: z.string().optional(),
        stoppedMotoHours: z.coerce.string().optional(),
        hasGps: z.boolean().default(false),
        gpsId: z.string().optional(),
        gpsGroupId: z.string().optional(),
        gpsName: z.string().optional(),
        hasBuzzer: z.boolean().default(false),
        hasFuelSensor: z.boolean().default(false),
        fuelConsumptionPerHour: z.coerce.string().optional(),
        notes: z.string().optional(),
        vehiclePictures: z
          .array(
            z.object({
              position: z.enum(enumVehiclePictureAngle.enumValues),
              url: z.string(),
            })
          )
          .optional(),
      })
    ),
    async (c) => {
      const currentUser = c.get('currentUser');

      if (!currentUser.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const input = normalizeVehicleInput(c.req.valid('json'), undefined);

      const created = await createVehicle({
        ...input,
        organizationId: currentUser.organizationId,
      });

      return c.json({
        data: created,
      });
    }
  )
  .put(
    '/vehicle',
    zValidator(
      'json',
      z.object({
        id: z.string(),
        name: z.string().optional(),
        code: z.string().optional(),
        vehicleNumber: z.string().optional().nullable(),
        serialNumber: z.string().optional().nullable(),
        engineNumber: z.string().optional().nullable(),
        vehicleOrganizationId: z.string().optional().nullable(),
        miningSectionId: z.string().optional().nullable(),
        mineNumber: z.string().optional().nullable(),
        type: z.enum(enumVehicleType.enumValues).optional().nullable(),
        soilCoefficient: z.string().optional().nullable(),
        coalCoefficient: z.string().optional().nullable(),
        commissioningDate: z.string().optional().nullable(),
        insuranceExpiryDate: z.string().optional().nullable(),
        decommissioningDate: z.string().optional().nullable(),
        stoppedMotoHours: z.coerce.string().optional().nullable(),
        hasGps: z.boolean().optional().nullable(),
        gpsId: z.string().optional().nullable(),
        gpsGroupId: z.string().optional().nullable(),
        gpsName: z.string().optional().nullable(),
        hasBuzzer: z.boolean().optional().nullable(),
        hasFuelSensor: z.boolean().optional().nullable(),
        fuelConsumptionPerHour: z.coerce.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        status: z.enum(enumVehicleStatus.enumValues).optional(),
        vehiclePictures: z
          .array(
            z.object({
              position: z.enum(enumVehiclePictureAngle.enumValues),
              url: z.string(),
              createdAt: z.string().optional(),
              vehicleId: z.string().optional(),
            })
          )
          .optional(),
      })
    ),
    async (c) => {
      const currentUser = c.get('currentUser');

      if (!currentUser.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const input = normalizeVehicleInput(c.req.valid('json'), null);

      const created = await updateVehicle(input.id, input);

      return c.json({
        data: created,
      });
    }
  )
  .delete(
    '/vehicle/delete-picture',
    zValidator(
      'json',
      z.object({
        vehicleId: z.string(),
        position: z.enum(enumVehiclePictureAngle.enumValues),
      })
    ),
    async (c) => {
      const user = c.get('currentUser');
      const { vehicleId, position } = c.req.valid('json');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      await drizzleDb
        .delete(vehiclePictures)
        .where(
          and(
            eq(vehiclePictures.vehicleId, vehicleId),
            eq(vehiclePictures.position, position)
          )
        );

      return c.json({
        success: true,
      });
    }
  )
  .delete(
    '/vehicle',
    zValidator(
      'json',
      z.object({
        id: z.string(),
      })
    ),
    async (c) => {
      const user = c.get('currentUser');
      const { id } = c.req.valid('json');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const vehicle = await getVehicleByPk(id);

      if (!vehicle) {
        throw new HTTPException(422, {
          message: 'Техник олдсонггүй',
        });
      }

      if (vehicle.organizationId !== user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const response = await deleteVehicle(id);

      return c.json({
        success: true,
      });
    }
  );

export default vehicleRoutes;
