import { drizzleDb } from '$/libs/database/db';

import {
  fuelNorms,
  fuelSuppliers,
  fuelTanks,
  vehicles,
} from '$/libs/database/schema';

import {
  and,
  asc,
  eq,
  isNull,
} from 'drizzle-orm';

import {
  toNumericOrNull,
  now,
  isUniqueViolation,
  insertAudit,
} from './common';

import {
  getOrgVehicle,
} from './lookups';

export const getFuelTanks = async (organizationId: string) => {
  return drizzleDb
    .select()
    .from(fuelTanks)
    .where(eq(fuelTanks.organizationId, organizationId))
    .orderBy(asc(fuelTanks.name));
};

export const getFuelTankByPk = async (organizationId: string, id: string) => {
  const [tank] = await drizzleDb
    .select()
    .from(fuelTanks)
    .where(and(eq(fuelTanks.id, id), eq(fuelTanks.organizationId, organizationId)))
    .limit(1);

  return tank ?? null;
};

export const createFuelTank = async (input: typeof fuelTanks.$inferInsert) => {
  try {
    const [tank] = await drizzleDb.insert(fuelTanks).values(input).returning();

    return tank;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('Ийм нэртэй агуулах бүртгэлтэй байна.');
    }

    throw error;
  }
};

export const updateFuelTank = async (
  organizationId: string,
  id: string,
  input: Partial<typeof fuelTanks.$inferInsert>,
) => {
  const { id: _id, organizationId: _org, ...values } = input;

  try {
    const [tank] = await drizzleDb
      .update(fuelTanks)
      .set({ ...values, updatedAt: now() })
      .where(and(eq(fuelTanks.id, id), eq(fuelTanks.organizationId, organizationId)))
      .returning();

    return tank ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('Ийм нэртэй агуулах бүртгэлтэй байна.');
    }

    throw error;
  }
};

export const getFuelSuppliers = async (organizationId: string) => {
  return drizzleDb
    .select()
    .from(fuelSuppliers)
    .where(eq(fuelSuppliers.organizationId, organizationId))
    .orderBy(asc(fuelSuppliers.name));
};

export const createFuelSupplier = async (input: typeof fuelSuppliers.$inferInsert) => {
  try {
    const [supplier] = await drizzleDb.insert(fuelSuppliers).values(input).returning();

    return supplier;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('Ийм нэртэй нийлүүлэгч бүртгэлтэй байна.');
    }

    throw error;
  }
};

export const updateFuelSupplier = async (
  organizationId: string,
  id: string,
  input: Partial<typeof fuelSuppliers.$inferInsert>,
) => {
  const { id: _id, organizationId: _org, ...values } = input;

  try {
    const [supplier] = await drizzleDb
      .update(fuelSuppliers)
      .set({ ...values, updatedAt: now() })
      .where(and(eq(fuelSuppliers.id, id), eq(fuelSuppliers.organizationId, organizationId)))
      .returning();

    return supplier ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('Ийм нэртэй нийлүүлэгч бүртгэлтэй байна.');
    }

    throw error;
  }
};

export const getFuelDispensers = async (organizationId: string) => {
  return drizzleDb
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.organizationId, organizationId),
        eq(vehicles.isFuelDispenser, true),
        isNull(vehicles.deletedAt),
      ),
    )
    .orderBy(asc(vehicles.mineNumber));
};

export const getFuelVehicles = async (organizationId: string) => {
  return drizzleDb
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.organizationId, organizationId), isNull(vehicles.deletedAt)))
    .orderBy(asc(vehicles.mineNumber));
};

export const updateVehicleFuelProfile = async (
  organizationId: string,
  vehicleId: string,
  input: {
    model?: string | null;
    fuelTankCapacity?: string | number | null;
    isFuelDispenser?: boolean;
    dispenserCapacity?: string | number | null;
  },
  userId?: string | null,
) => {
  const before = await getOrgVehicle(drizzleDb, organizationId, vehicleId);

  const [vehicle] = await drizzleDb
    .update(vehicles)
    .set({
      ...(input.model !== undefined && { model: input.model?.trim() || null }),
      ...(input.fuelTankCapacity !== undefined && { fuelTankCapacity: toNumericOrNull(input.fuelTankCapacity) }),
      ...(input.isFuelDispenser !== undefined && { isFuelDispenser: input.isFuelDispenser }),
      ...(input.dispenserCapacity !== undefined && { dispenserCapacity: toNumericOrNull(input.dispenserCapacity) }),
    })
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, organizationId)))
    .returning();

  await insertAudit(drizzleDb, {
    organizationId,
    entityType: 'vehicle_fuel_profile',
    entityId: vehicleId,
    action: 'update',
    before: {
      model: before.model,
      fuelTankCapacity: before.fuelTankCapacity,
      isFuelDispenser: before.isFuelDispenser,
      dispenserCapacity: before.dispenserCapacity,
    },
    after: input,
    userId,
  });

  return vehicle;
};

export const getFuelNorms = async (organizationId: string) => {
  return drizzleDb
    .select()
    .from(fuelNorms)
    .where(eq(fuelNorms.organizationId, organizationId))
    .orderBy(asc(fuelNorms.vehicleModel));
};

export const upsertFuelNorm = async (input: {
  organizationId: string;
  vehicleModel: string;
  targetLitersPerTrip?: string | number | null;
  targetLitersPerM3?: string | number | null;
  thresholdPercent?: string | number | null;
  isActive?: boolean;
  notes?: string | null;
}) => {
  const vehicleModel = input.vehicleModel.trim();

  if (!vehicleModel) {
    throw new Error('Техникийн загвар шаардлагатай.');
  }

  const values = {
    targetLitersPerTrip: toNumericOrNull(input.targetLitersPerTrip, 3),
    targetLitersPerM3: toNumericOrNull(input.targetLitersPerM3, 4),
    thresholdPercent: toNumericOrNull(input.thresholdPercent),
    isActive: input.isActive ?? true,
    notes: input.notes ?? null,
    updatedAt: now(),
  };

  const [norm] = await drizzleDb
    .insert(fuelNorms)
    .values({ organizationId: input.organizationId, vehicleModel, ...values })
    .onConflictDoUpdate({
      target: [fuelNorms.organizationId, fuelNorms.vehicleModel],
      set: values,
    })
    .returning();

  return norm;
};

export const deleteFuelNorm = async (organizationId: string, id: string) => {
  const [norm] = await drizzleDb
    .delete(fuelNorms)
    .where(and(eq(fuelNorms.id, id), eq(fuelNorms.organizationId, organizationId)))
    .returning();

  return norm ?? null;
};