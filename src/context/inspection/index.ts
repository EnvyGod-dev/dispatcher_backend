import { drizzleDb } from '$/libs/database/db';
import {
  enumVehicleType,
  inspections,
  shiftInspections,
  vehicles,
} from '$/libs/database/schema';
import { first, firstOrNull, type PaginationType } from '$/libs/database/utils';
import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { VehicleType } from '../vehicle/types';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import logger from '$/utils/logger';
import { ClientError } from '$/utils/errors';

export type CreateInspectionInput = typeof inspections.$inferInsert;
export type Inspection = typeof inspections.$inferSelect;

export const getInspections = async (
  { limit, offset }: PaginationType,
  {
    organizationId,
    vehicleType,
  }: {
    organizationId: string;
    vehicleType?: VehicleType;
  }
) => {
  return drizzleDb
    .select()
    .from(inspections)
    .where(
      and(
        isNull(inspections.deletedAt),
        eq(inspections.organizationId, organizationId),
        vehicleType ? eq(inspections.vehicleType, vehicleType) : undefined
      )
    )
    .orderBy(desc(inspections.createdAt))
    .limit(limit)
    .offset(offset);
};

export const getInspectionCount = async ({
  organizationId,
  vehicleType,
}: {
  organizationId: string;
  vehicleType?: VehicleType;
}) => {
  const query = firstOrNull(
    await drizzleDb
      .select({ count: count() })
      .from(inspections)
      .where(
        and(
          isNull(inspections.deletedAt),
          eq(inspections.organizationId, organizationId),
          vehicleType ? eq(inspections.vehicleType, vehicleType) : undefined
        )
      )
  );

  return query ? query.count : 0;
};

export const createInspection = async (input: CreateInspectionInput) => {
  return first(await drizzleDb.insert(inspections).values(input).returning());
};

export const updateInspection = async (
  id: string,
  input: Partial<CreateInspectionInput>
) => {
  return firstOrNull(
    await drizzleDb
      .update(inspections)
      .set(input)
      .where(eq(inspections.id, id))
      .returning()
  );
};

export type InspectionStatus = 'issue' | 'normal' | 'needs_inspection';

type CreateShiftInspectionInput = typeof shiftInspections.$inferInsert;

export const createShiftInspection = async (
  input: CreateShiftInspectionInput
) => {
  const updatedVehicle = await drizzleDb
    .update(vehicles)
    .set({ lastInspection: new Date() })
    .where(eq(vehicles.id, input.vehicleId!));

  logger.info({
    event: 'shift-inspection.created',
    data: {
      updatedVehicle,
    },
  });

  return first(
    await drizzleDb.insert(shiftInspections).values(input).returning()
  );
};

export async function createShiftInspectionsBulk(
  inputs: CreateShiftInspectionInput[]
) {
  if (!inputs[0]?.vehicleId) {
    throw new ClientError('Vehicle id required');
  }

  const updatedVehicle = await drizzleDb
    .update(vehicles)
    .set({ lastInspection: new Date() })
    .where(eq(vehicles.id, inputs[0].vehicleId!));

  logger.info({
    event: 'bulk-shift-inspection.created',
    data: {
      updatedVehicle,
    },
  });

  const inspectionRecords = await drizzleDb
    .insert(shiftInspections)
    .values(inputs)
    .returning();

  return inspectionRecords;
}

export const updateShiftInspectionPhoto = async (
  id: string,
  photoUrl: string
) => {
  return firstOrNull(
    await drizzleDb
      .update(shiftInspections)
      .set({ photoUrl })
      .where(eq(shiftInspections.id, id))
      .returning()
  );
};

export const checkExistingShiftInspection = async ({
  shiftId,
  shiftInspectionIds,
}: {
  shiftId: string;
  shiftInspectionIds: string[];
}) => {
  const existing = firstOrNull(
    await drizzleDb
      .select()
      .from(shiftInspections)
      .where(
        and(
          eq(shiftInspections.id, shiftId),
          inArray(shiftInspections.id, shiftInspectionIds)
        )
      )
  );

  return existing;
};

export const deleteInspection = async (id: string) => {
  return firstOrNull(
    await drizzleDb
      .update(inspections)
      .set({
        deletedAt: new Date().toISOString(),
      })
      .where(eq(inspections.id, id))
      .returning()
  );
};

export const createBulkInspection = async ({
  jsonData,
  organizationId,
}: {
  jsonData: Inspection[];
  organizationId: string;
}) => {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as Array<{ row: number; error: string; data: any }>,
  };

  const validInspections: Array<{
    vehicleType: VehicleType;
    name: string;
    type?: string;
    organizationId: string;
  }> = [];

  for (let i = 0; i < jsonData.length; i++) {
    const row: any = jsonData[i];
    const rowNumber = i + 2;

    try {
      const validationSchema = z.object({
        vehicleType: z.enum(enumVehicleType.enumValues, {
          errorMap: () => ({ message: 'Буруу техникийн төрөл' }),
        }),
        name: z.string().min(1, 'Нэр шаардлагатай'),
        type: z.string().optional(),
      });

      const validated = validationSchema.parse(row);

      validInspections.push({
        ...validated,
        organizationId,
      });
    } catch (error) {
      results.failed++;
      results.errors.push({
        row: rowNumber,
        error:
          error instanceof z.ZodError
            ? error.errors
                .map((e) => `${e.path.join('.')}: ${e.message}`)
                .join(', ')
            : 'Алдаатай өгөгдөл',
        data: row,
      });
    }
  }

  if (validInspections.length > 0) {
    try {
      for (const [idx, inspection] of validInspections.entries()) {
        console.log(inspection, 'inspection', idx, 'idx');
        const existing = await drizzleDb
          .select()
          .from(inspections)
          .where(
            and(
              isNull(inspections.deletedAt),
              inspection.name
                ? eq(inspections.name, inspection.name)
                : undefined,
              eq(inspections.type, inspection.type || ''),
              eq(inspections.organizationId, inspection.organizationId),
              eq(inspections.vehicleType, inspection.vehicleType)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          results.errors.push({
            row: idx,
            error: 'Үзлэг давхардсан',
            data: inspection,
          });

          continue;
        }

        const created = await createInspection(inspection);

        console.log(created, 'created');

        if (created) {
          results.success++;
        }
      }
    } catch (error) {
      throw new HTTPException(500, {
        message: 'Үзлэг үүсгэхэд алдаа гарлаа',
      });
    }
  }

  return results;
};

export const getShiftInspections = async (shiftId: string) => {
  return drizzleDb.query.shiftInspections.findMany({
    where: eq(shiftInspections.shiftId, shiftId),
    with: {
      inspection: true,
    },
  });
};
