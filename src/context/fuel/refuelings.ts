import { drizzleDb } from '$/libs/database/db';

import {
  fuelRefuelings,
  fuelTanks,
  vehicles,
} from '$/libs/database/schema';

import {
  and,
  desc,
  eq,
  gte,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  type ShiftType,
  type Holder,
  toNumberOrNull,
  round,
  toNumeric,
  toNumericOrNull,
  now,
  toOperationalDate,
  errorMessage,
  isUniqueViolation,
  insertAudit,
  requireRow,
} from './common';

import {
  getOrgTank,
  getOrgVehicle,
  getDispenserVehicle,
  assertOrgUser,
} from './lookups';

import {
  lockHolders,
  assertWithdrawable,
  assertAfterOpening,
  insertLedger,
} from './ledger';

type CreateRefuelingInput = {
  organizationId: string;
  clientId?: string | null;
  sourceType: 'tank' | 'dispenser';
  dispenserVehicleId?: string | null;
  tankId?: string | null;
  receiverVehicleId: string;
  quantity?: string | number | null;
  refueledAt: string;
  operationalDate?: string;
  shiftType?: ShiftType | null;
  meterStart?: string | number | null;
  meterEnd?: string | number | null;
  operatorId: string;
  receiverOperatorId?: string | null;
  miningBlockId?: string | null;
  locationNote?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  photoUrl?: string | null;
  notes?: string | null;
  createdBy: string;
};

const resolveRefuelQuantity = (input: CreateRefuelingInput) => {
  const meterStart = toNumberOrNull(input.meterStart);
  const meterEnd = toNumberOrNull(input.meterEnd);
  const hasMeters = meterStart !== null && meterEnd !== null;

  if (hasMeters && meterEnd < meterStart) {
    throw new Error('Тоолуурын төгсгөлийн заалт эхлэлээс бага байна.');
  }

  const meterQuantity = hasMeters ? round(meterEnd - meterStart) : null;
  const quantity = toNumberOrNull(input.quantity) ?? meterQuantity;

  if (quantity === null || quantity <= 0) {
    throw new Error('Цэнэглэсэн хэмжээ эсвэл тоолуурын эхлэл/төгсгөлийн заалт оруулна уу.');
  }

  const meterMismatch = meterQuantity !== null && Math.abs(meterQuantity - quantity) > Math.max(1, quantity * 0.01);

  return { quantity: round(quantity), meterQuantity, meterMismatch };
};

export const createFuelRefueling = async (input: CreateRefuelingInput) => {
  if (input.clientId) {
    const [existing] = await drizzleDb
      .select()
      .from(fuelRefuelings)
      .where(and(eq(fuelRefuelings.organizationId, input.organizationId), eq(fuelRefuelings.clientId, input.clientId)))
      .limit(1);

    if (existing) {
      return existing;
    }
  }

  if (input.sourceType === 'dispenser' && !input.dispenserVehicleId) {
    throw new Error('Түгээж буй техникийн парк дугаар шаардлагатай.');
  }

  if (input.sourceType === 'tank' && !input.tankId) {
    throw new Error('Сав шаардлагатай.');
  }

  const { quantity } = resolveRefuelQuantity(input);

  try {
    return await drizzleDb.transaction(async (tx) => {
      let sourceHolder: Holder;
      let sourceLabel: string;

      if (input.sourceType === 'dispenser') {
        const dispenser = await getDispenserVehicle(tx, input.organizationId, input.dispenserVehicleId!);

        sourceHolder = { holderType: 'dispenser', vehicleId: dispenser.id };
        sourceLabel = `Түгээх машин ${dispenser.mineNumber ?? dispenser.name}`;
      } else {
        const tank = await getOrgTank(tx, input.organizationId, input.tankId!);

        sourceHolder = { holderType: 'tank', tankId: tank.id };
        sourceLabel = tank.name;
      }

      const receiver = await getOrgVehicle(tx, input.organizationId, input.receiverVehicleId, 'Хүлээн авагч техник');
      const receiverHolder: Holder = { holderType: 'equipment', vehicleId: receiver.id };
      const receiverLabel = `Техник ${receiver.mineNumber ?? receiver.name}`;
      const receiverCapacity = toNumberOrNull(receiver.fuelTankCapacity);

      if (receiverCapacity !== null && receiverCapacity > 0 && quantity > receiverCapacity) {
        throw new Error(
          `${receiverLabel}: нэг удаагийн цэнэглэлт (${quantity} л) савны багтаамжаас (${receiverCapacity} л) их байна.`,
        );
      }

      await assertOrgUser(tx, input.organizationId, input.operatorId, 'Оператор');

      if (input.receiverOperatorId) {
        await assertOrgUser(tx, input.organizationId, input.receiverOperatorId, 'Хүлээн авсан жолооч');
      }

      await lockHolders(tx, input.organizationId, [sourceHolder, receiverHolder]);
      await assertAfterOpening(tx, input.organizationId, sourceHolder, input.refueledAt, sourceLabel);
      await assertAfterOpening(tx, input.organizationId, receiverHolder, input.refueledAt, receiverLabel);
      await assertWithdrawable(tx, input.organizationId, sourceHolder, input.refueledAt, quantity, sourceLabel);

      const operationalDate = input.operationalDate ?? toOperationalDate(input.refueledAt);

      const refueling = requireRow(await tx
        .insert(fuelRefuelings)
        .values({
          organizationId: input.organizationId,
          clientId: input.clientId ?? null,
          sourceType: input.sourceType,
          dispenserVehicleId: input.sourceType === 'dispenser' ? input.dispenserVehicleId! : null,
          tankId: input.sourceType === 'tank' ? input.tankId! : null,
          receiverVehicleId: receiver.id,
          quantity: toNumeric(quantity),
          refueledAt: input.refueledAt,
          operationalDate,
          shiftType: input.shiftType ?? null,
          meterStart: toNumericOrNull(input.meterStart),
          meterEnd: toNumericOrNull(input.meterEnd),
          operatorId: input.operatorId,
          receiverOperatorId: input.receiverOperatorId ?? null,
          miningBlockId: input.miningBlockId ?? null,
          locationNote: input.locationNote ?? null,
          latitude: toNumericOrNull(input.latitude, 7),
          longitude: toNumericOrNull(input.longitude, 7),
          photoUrl: input.photoUrl ?? null,
          notes: input.notes ?? null,
          syncedAt: input.clientId ? now() : null,
          createdBy: input.createdBy,
        })
        .returning());

      await insertLedger(tx, input.organizationId, [
        {
          holder: sourceHolder,
          entryType: 'refuel',
          delta: -quantity,
          occurredAt: input.refueledAt,
          operationalDate,
          refuelingId: refueling.id,
        },
        {
          holder: receiverHolder,
          entryType: 'refuel',
          delta: quantity,
          occurredAt: input.refueledAt,
          operationalDate,
          refuelingId: refueling.id,
        },
      ]);

      await insertAudit(tx, {
        organizationId: input.organizationId,
        entityType: 'fuel_refueling',
        entityId: refueling.id,
        action: 'create',
        after: refueling,
        userId: input.createdBy,
      });

      return refueling;
    });
  } catch (error) {
    if (input.clientId && isUniqueViolation(error)) {
      const [existing] = await drizzleDb
        .select()
        .from(fuelRefuelings)
        .where(and(eq(fuelRefuelings.organizationId, input.organizationId), eq(fuelRefuelings.clientId, input.clientId)))
        .limit(1);

      if (existing) {
        return existing;
      }
    }

    throw error;
  }
};

export const syncFuelRefuelings = async (
  organizationId: string,
  userId: string,
  items: Omit<CreateRefuelingInput, 'organizationId' | 'createdBy'>[],
) => {
  const sorted = [...items].sort((a, b) => new Date(a.refueledAt).getTime() - new Date(b.refueledAt).getTime());
  const results: { clientId: string | null; status: 'saved' | 'error'; id?: string; error?: string }[] = [];

  for (const item of sorted) {
    try {
      const refueling = await createFuelRefueling({ ...item, organizationId, createdBy: userId });

      results.push({ clientId: item.clientId ?? null, status: 'saved', id: refueling.id });
    } catch (error) {
      results.push({ clientId: item.clientId ?? null, status: 'error', error: errorMessage(error) });
    }
  }

  return {
    saved: results.filter((r) => r.status === 'saved').length,
    failed: results.filter((r) => r.status === 'error').length,
    results,
  };
};

export const getFuelRefuelings = async (
  organizationId: string,
  input?: {
    from?: string;
    to?: string;
    receiverVehicleId?: string;
    dispenserVehicleId?: string;
    tankId?: string;
    shiftType?: ShiftType;
  },
) => {
  const conditions: SQL[] = [eq(fuelRefuelings.organizationId, organizationId)];

  if (input?.from) {
    conditions.push(gte(fuelRefuelings.operationalDate, input.from));
  }

  if (input?.to) {
    conditions.push(lte(fuelRefuelings.operationalDate, input.to));
  }

  if (input?.receiverVehicleId) {
    conditions.push(eq(fuelRefuelings.receiverVehicleId, input.receiverVehicleId));
  }

  if (input?.dispenserVehicleId) {
    conditions.push(eq(fuelRefuelings.dispenserVehicleId, input.dispenserVehicleId));
  }

  if (input?.tankId) {
    conditions.push(eq(fuelRefuelings.tankId, input.tankId));
  }

  if (input?.shiftType) {
    conditions.push(eq(fuelRefuelings.shiftType, input.shiftType));
  }

  const rows = await drizzleDb
    .select({
      refueling: fuelRefuelings,
      receiverMineNumber: vehicles.mineNumber,
      receiverName: vehicles.name,
      receiverModel: vehicles.model,
      dispenserMineNumber: sql<string | null>`(SELECT d.mine_number FROM vehicles d WHERE d.id = ${fuelRefuelings.dispenserVehicleId})`,
      tankName: fuelTanks.name,
    })
    .from(fuelRefuelings)
    .innerJoin(vehicles, eq(vehicles.id, fuelRefuelings.receiverVehicleId))
    .leftJoin(fuelTanks, eq(fuelTanks.id, fuelRefuelings.tankId))
    .where(and(...conditions))
    .orderBy(desc(fuelRefuelings.refueledAt));

  return rows.map((r) => ({
    ...r.refueling,
    receiverMineNumber: r.receiverMineNumber,
    receiverName: r.receiverName,
    receiverModel: r.receiverModel,
    dispenserMineNumber: r.dispenserMineNumber,
    tankName: r.tankName,
  }));
};