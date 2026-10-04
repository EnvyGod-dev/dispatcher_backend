import { drizzleDb } from '$/libs/database/db';

import {
  vehicles,
} from '$/libs/database/schema';

import {
  and,
  asc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  type HolderType,
  type Holder,
  L,
  toNumber,
  toNumberOrNull,
  round,
  addDays,
  assertRange,
} from './common';

import {
  holderLabel,
} from './lookups';

import {
  holderConditions,
  balanceOf,
} from './ledger';

import {
  getFuelTanks,
} from './master-data';

type BalanceInput = {
  organizationId: string;
  holderType: HolderType;
  tankId?: string | null;
  vehicleId?: string | null;
  at?: string;
};

export const getFuelBalance = async (input: BalanceInput): Promise<number> => {
  return balanceOf(
    drizzleDb,
    input.organizationId,
    { holderType: input.holderType, tankId: input.tankId, vehicleId: input.vehicleId },
    input.at,
  );
};

export const getTankBalance = async (organizationId: string, tankId: string) => {
  return getFuelBalance({ organizationId, holderType: 'tank', tankId });
};

export const getVehicleFuelBalance = async (
  organizationId: string,
  vehicleId: string,
  holderType: 'dispenser' | 'equipment' = 'equipment',
) => {
  return getFuelBalance({ organizationId, holderType, vehicleId });
};

export const getFuelHolderBalances = async (organizationId: string, holderType: HolderType, at?: string) => {
  const conditions: SQL[] = [eq(L.organizationId, organizationId), eq(L.holderType, holderType)];

  if (at) {
    conditions.push(lte(L.occurredAt, at));
  }

  const sums = await drizzleDb
    .select({
      tankId: L.tankId,
      vehicleId: L.vehicleId,
      balance: sql<string>`SUM(${L.delta})`,
      lastMovementAt: sql<string>`MAX(${L.occurredAt})`,
    })
    .from(L)
    .where(and(...conditions))
    .groupBy(L.tankId, L.vehicleId);

  if (holderType === 'tank') {
    const tanks = await getFuelTanks(organizationId);
    const byId = new Map(sums.map((s) => [s.tankId, s]));

    return tanks
      .filter((t) => t.isActive || byId.has(t.id))
      .map((t) => {
        const s = byId.get(t.id);
        const balance = round(toNumber(s?.balance));
        const capacity = toNumberOrNull(t.capacity);

        return {
          holderType,
          holderId: t.id,
          name: t.name,
          mineNumber: null as string | null,
          model: null as string | null,
          fuelType: t.fuelType,
          capacity,
          balance,
          fillPercent: capacity ? round((balance / capacity) * 100, 1) : null,
          lastMovementAt: s?.lastMovementAt ?? null,
        };
      });
  }

  const vehicleIds = sums.map((s) => s.vehicleId).filter((id): id is string => !!id);
  const vehicleConditions: SQL[] = [eq(vehicles.organizationId, organizationId)];

  if (holderType === 'dispenser') {
    vehicleConditions.push(
      vehicleIds.length > 0
        ? sql`(${vehicles.isFuelDispenser} = true OR ${inArray(vehicles.id, vehicleIds)})`
        : eq(vehicles.isFuelDispenser, true),
    );
  } else {
    if (vehicleIds.length === 0) {
      return [];
    }

    vehicleConditions.push(inArray(vehicles.id, vehicleIds));
  }

  const vehicleRows = await drizzleDb
    .select()
    .from(vehicles)
    .where(and(...vehicleConditions))
    .orderBy(asc(vehicles.mineNumber));

  const byId = new Map(sums.map((s) => [s.vehicleId, s]));

  return vehicleRows.map((v) => {
    const s = byId.get(v.id);
    const balance = round(toNumber(s?.balance));
    const capacity = toNumberOrNull(holderType === 'dispenser' ? v.dispenserCapacity : v.fuelTankCapacity);

    return {
      holderType,
      holderId: v.id,
      name: v.name,
      mineNumber: v.mineNumber,
      model: v.model,
      fuelType: null as string | null,
      capacity,
      balance,
      fillPercent: capacity ? round((balance / capacity) * 100, 1) : null,
      lastMovementAt: s?.lastMovementAt ?? null,
    };
  });
};

export const getFuelLedgerHistory = async (organizationId: string, holder: Holder, from: string, to: string) => {
  assertRange(from, to);
  await holderLabel(drizzleDb, organizationId, holder);

  const base = holderConditions(organizationId, holder);

  const [opening] = await drizzleDb
    .select({ balance: sql<string | null>`COALESCE(SUM(${L.delta}), 0)` })
    .from(L)
    .where(and(...base, lt(L.operationalDate, from)));

  const entries = await drizzleDb
    .select({
      entry: L,
      refuelReceiverMineNumber: sql<string | null>`(
        SELECT v.mine_number FROM vehicles v
        JOIN fuel_refuelings r ON r.receiver_vehicle_id = v.id
        WHERE r.id = ${L.refuelingId}
      )`,
      refuelSourceMineNumber: sql<string | null>`(
        SELECT v.mine_number FROM vehicles v
        JOIN fuel_refuelings r ON r.dispenser_vehicle_id = v.id
        WHERE r.id = ${L.refuelingId}
      )`,
    })
    .from(L)
    .where(and(...base, gte(L.operationalDate, from), lte(L.operationalDate, to)))
    .orderBy(asc(L.operationalDate), asc(L.occurredAt), asc(L.createdAt), asc(L.id));

  const openingBalance = round(toNumber(opening?.balance));
  let running = openingBalance;

  const rows = entries.map(({ entry, refuelReceiverMineNumber, refuelSourceMineNumber }) => {
    running = round(running + toNumber(entry.delta));

    return {
      id: entry.id,
      entryType: entry.entryType,
      delta: toNumber(entry.delta),
      balanceAfter: running,
      occurredAt: entry.occurredAt,
      operationalDate: entry.operationalDate,
      receiptId: entry.receiptId,
      issueId: entry.issueId,
      refuelingId: entry.refuelingId,
      openingBalanceId: entry.openingBalanceId,
      measurementId: entry.measurementId,
      counterpartMineNumber: holder.holderType === 'equipment' ? refuelSourceMineNumber : refuelReceiverMineNumber,
    };
  });

  return {
    openingBalance,
    closingBalance: running,
    totalIn: round(rows.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0)),
    totalOut: round(rows.filter((r) => r.delta < 0).reduce((s, r) => s - r.delta, 0)),
    entries: rows,
  };
};

export const getFuelDailyBalances = async (organizationId: string, holder: Holder, from: string, to: string) => {
  assertRange(from, to);
  await holderLabel(drizzleDb, organizationId, holder);

  const base = holderConditions(organizationId, holder);

  const [opening] = await drizzleDb
    .select({ balance: sql<string | null>`COALESCE(SUM(${L.delta}), 0)` })
    .from(L)
    .where(and(...base, lt(L.operationalDate, from)));

  const days = await drizzleDb
    .select({
      date: L.operationalDate,
      opening: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.entryType} = 'opening'), 0)`,
      inflow: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.delta} > 0 AND ${L.entryType} NOT IN ('adjustment', 'opening')), 0)`,
      outflow: sql<string>`COALESCE(-SUM(${L.delta}) FILTER (WHERE ${L.delta} < 0 AND ${L.entryType} NOT IN ('adjustment', 'opening')), 0)`,
      adjustment: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.entryType} = 'adjustment'), 0)`,
    })
    .from(L)
    .where(and(...base, gte(L.operationalDate, from), lte(L.operationalDate, to)))
    .groupBy(L.operationalDate)
    .orderBy(asc(L.operationalDate));

  const byDate = new Map(days.map((d) => [d.date, d]));
  const result: {
    date: string;
    opening: number;
    inflow: number;
    outflow: number;
    adjustment: number;
    closing: number;
  }[] = [];

  let running = round(toNumber(opening?.balance));

  for (let date = from; date <= to; date = addDays(date, 1)) {
    const row = byDate.get(date);
    const start = round(running + toNumber(row?.opening));
    const inflow = round(toNumber(row?.inflow));
    const outflow = round(toNumber(row?.outflow));
    const adjustment = round(toNumber(row?.adjustment));
    const closing = round(start + inflow - outflow + adjustment);

    result.push({ date, opening: start, inflow, outflow, adjustment, closing });
    running = closing;
  }

  return result;
};