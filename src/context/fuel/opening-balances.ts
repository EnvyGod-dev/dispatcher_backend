import { drizzleDb } from '$/libs/database/db';

import {
  fuelOpeningBalances,
  fuelTanks,
  vehicles,
} from '$/libs/database/schema';

import {
  and,
  asc,
  eq,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  type HolderType,
  type MeasureMethod,
  type Holder,
  L,
  toNumber,
  toNumeric,
  toOperationalDate,
  isUniqueViolation,
  assertNonNegative,
  insertAudit,
  requireRow,
} from './common';

import {
  holderLabel,
} from './lookups';

import {
  holderConditions,
  lockHolders,
  insertLedger,
} from './ledger';

type OpeningBalanceInput = {
  organizationId: string;
  holderType: HolderType;
  tankId?: string | null;
  vehicleId?: string | null;
  balanceAt: string;
  operationalDate?: string;
  quantity: string | number;
  method: MeasureMethod;
  notes?: string | null;
  recordedBy: string;
};

export const createFuelOpeningBalance = async (input: OpeningBalanceInput) => {
  assertNonNegative(input.quantity);

  const holder: Holder = {
    holderType: input.holderType,
    tankId: input.holderType === 'tank' ? input.tankId : null,
    vehicleId: input.holderType === 'tank' ? null : input.vehicleId,
  };

  try {
    return await drizzleDb.transaction(async (tx) => {
      await holderLabel(tx, input.organizationId, holder);
      await lockHolders(tx, input.organizationId, [holder]);

      const [before] = await tx
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(L)
        .where(and(...holderConditions(input.organizationId, holder), lt(L.occurredAt, input.balanceAt)));

      if ((before?.count ?? 0) > 0) {
        throw new Error('Гарааны үлдэгдлийн огнооноос өмнө бүртгэгдсэн хөдөлгөөн байна. Огноог хамгийн эхний хөдөлгөөнөөс өмнө сонгоно уу.');
      }

      const operationalDate = input.operationalDate ?? toOperationalDate(input.balanceAt);

      const opening = requireRow(await tx
        .insert(fuelOpeningBalances)
        .values({
          organizationId: input.organizationId,
          holderType: holder.holderType,
          tankId: holder.tankId ?? null,
          vehicleId: holder.vehicleId ?? null,
          balanceAt: input.balanceAt,
          operationalDate,
          quantity: toNumeric(input.quantity),
          method: input.method,
          notes: input.notes ?? null,
          recordedBy: input.recordedBy,
        })
        .returning());

      await insertLedger(tx, input.organizationId, [
        {
          holder,
          entryType: 'opening',
          delta: toNumber(input.quantity),
          occurredAt: input.balanceAt,
          operationalDate,
          openingBalanceId: opening.id,
        },
      ]);

      await insertAudit(tx, {
        organizationId: input.organizationId,
        entityType: 'fuel_opening_balance',
        entityId: opening.id,
        action: 'create',
        after: opening,
        userId: input.recordedBy,
      });

      return opening;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('Энэ агуулах/техникт гарааны үлдэгдэл аль хэдийн бүртгэгдсэн байна.');
    }

    throw error;
  }
};

export const getFuelOpeningBalances = async (organizationId: string, holderType?: HolderType) => {
  const conditions: SQL[] = [eq(fuelOpeningBalances.organizationId, organizationId)];

  if (holderType) {
    conditions.push(eq(fuelOpeningBalances.holderType, holderType));
  }

  const rows = await drizzleDb
    .select({
      opening: fuelOpeningBalances,
      tankName: fuelTanks.name,
      vehicleMineNumber: vehicles.mineNumber,
      vehicleName: vehicles.name,
    })
    .from(fuelOpeningBalances)
    .leftJoin(fuelTanks, eq(fuelTanks.id, fuelOpeningBalances.tankId))
    .leftJoin(vehicles, eq(vehicles.id, fuelOpeningBalances.vehicleId))
    .where(and(...conditions))
    .orderBy(asc(fuelOpeningBalances.holderType), asc(fuelOpeningBalances.balanceAt));

  return rows.map((r) => ({
    ...r.opening,
    tankName: r.tankName,
    vehicleMineNumber: r.vehicleMineNumber,
    vehicleName: r.vehicleName,
  }));
};