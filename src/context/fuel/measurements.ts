import { drizzleDb } from '$/libs/database/db';

import {
  fuelBalanceMeasurements,
  fuelTanks,
  vehicles,
} from '$/libs/database/schema';

import {
  and,
  desc,
  eq,
  gte,
  lte,
  type SQL,
} from 'drizzle-orm';

import {
  type HolderType,
  type MeasureMethod,
  type Holder,
  toNumber,
  round,
  toNumeric,
  toOperationalDate,
  assertNonNegative,
  insertAudit,
  requireRow,
} from './common';

import {
  holderLabel,
} from './lookups';

import {
  lockHolders,
  balanceOf,
  insertLedger,
} from './ledger';

type MeasurementInput = {
  organizationId: string;
  holderType: HolderType;
  tankId?: string | null;
  vehicleId?: string | null;
  measuredAt: string;
  operationalDate?: string;
  measuredQuantity: string | number;
  method: MeasureMethod;
  applyAdjustment?: boolean;
  notes?: string | null;
  recordedBy: string;
};

export const createFuelMeasurement = async (input: MeasurementInput) => {
  assertNonNegative(input.measuredQuantity);

  const holder: Holder = {
    holderType: input.holderType,
    tankId: input.holderType === 'tank' ? input.tankId : null,
    vehicleId: input.holderType === 'tank' ? null : input.vehicleId,
  };

  return drizzleDb.transaction(async (tx) => {
    await holderLabel(tx, input.organizationId, holder);
    await lockHolders(tx, input.organizationId, [holder]);

    const calculatedQuantity = await balanceOf(tx, input.organizationId, holder, input.measuredAt);
    const measuredQuantity = round(toNumber(input.measuredQuantity));
    const difference = round(measuredQuantity - calculatedQuantity);
    const operationalDate = input.operationalDate ?? toOperationalDate(input.measuredAt);

    const measurement = requireRow(await tx
      .insert(fuelBalanceMeasurements)
      .values({
        organizationId: input.organizationId,
        holderType: holder.holderType,
        tankId: holder.tankId ?? null,
        vehicleId: holder.vehicleId ?? null,
        measuredAt: input.measuredAt,
        operationalDate,
        calculatedQuantity: toNumeric(calculatedQuantity),
        measuredQuantity: toNumeric(measuredQuantity),
        difference: toNumeric(difference),
        method: input.method,
        applyAdjustment: input.applyAdjustment ?? false,
        notes: input.notes ?? null,
        recordedBy: input.recordedBy,
      })
      .returning());

    if (input.applyAdjustment && difference !== 0) {
      await insertLedger(tx, input.organizationId, [
        {
          holder,
          entryType: 'adjustment',
          delta: difference,
          occurredAt: input.measuredAt,
          operationalDate,
          measurementId: measurement.id,
        },
      ]);
    }

    await insertAudit(tx, {
      organizationId: input.organizationId,
      entityType: 'fuel_measurement',
      entityId: measurement.id,
      action: 'create',
      after: measurement,
      userId: input.recordedBy,
    });

    return measurement;
  });
};

export const getFuelMeasurements = async (
  organizationId: string,
  input?: {
    from?: string;
    to?: string;
    holderType?: HolderType;
    tankId?: string;
    vehicleId?: string;
  },
) => {
  const conditions: SQL[] = [eq(fuelBalanceMeasurements.organizationId, organizationId)];

  if (input?.from) {
    conditions.push(gte(fuelBalanceMeasurements.operationalDate, input.from));
  }

  if (input?.to) {
    conditions.push(lte(fuelBalanceMeasurements.operationalDate, input.to));
  }

  if (input?.holderType) {
    conditions.push(eq(fuelBalanceMeasurements.holderType, input.holderType));
  }

  if (input?.tankId) {
    conditions.push(eq(fuelBalanceMeasurements.tankId, input.tankId));
  }

  if (input?.vehicleId) {
    conditions.push(eq(fuelBalanceMeasurements.vehicleId, input.vehicleId));
  }

  const rows = await drizzleDb
    .select({
      measurement: fuelBalanceMeasurements,
      tankName: fuelTanks.name,
      vehicleMineNumber: vehicles.mineNumber,
    })
    .from(fuelBalanceMeasurements)
    .leftJoin(fuelTanks, eq(fuelTanks.id, fuelBalanceMeasurements.tankId))
    .leftJoin(vehicles, eq(vehicles.id, fuelBalanceMeasurements.vehicleId))
    .where(and(...conditions))
    .orderBy(desc(fuelBalanceMeasurements.measuredAt));

  return rows.map((r) => ({
    ...r.measurement,
    tankName: r.tankName,
    vehicleMineNumber: r.vehicleMineNumber,
  }));
};