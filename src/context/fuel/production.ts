import { drizzleDb } from '$/libs/database/db';

import {
  fuelProductionStats,
  markshaderDailyReports,
  shifts,
  vehicles,
  workLogs,
} from '$/libs/database/schema';

import {
  and,
  asc,
  eq,
  gte,
  lte,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  type ShiftType,
  toNumber,
  round,
  toNumeric,
  toNumericOrNull,
  now,
  assertNonNegative,
  assertRange,
} from './common';

import {
  getOrgVehicle,
} from './lookups';

export const upsertFuelProductionStat = async (input: {
  organizationId: string;
  vehicleId: string;
  operationalDate: string;
  shiftType: ShiftType;
  tripCount: number;
  volumeM3: string | number;
  tonnage?: string | number | null;
  source: 'stratum' | 'import' | 'manual';
  notes?: string | null;
  importedBy?: string | null;
}) => {
  if (input.tripCount < 0) {
    throw new Error('Рейсийн тоо сөрөг байж болохгүй.');
  }

  assertNonNegative(input.volumeM3);
  await getOrgVehicle(drizzleDb, input.organizationId, input.vehicleId);

  const values = {
    tripCount: Math.round(input.tripCount),
    volumeM3: toNumeric(input.volumeM3),
    tonnage: toNumericOrNull(input.tonnage),
    source: input.source,
    notes: input.notes ?? null,
    importedBy: input.importedBy ?? null,
    updatedAt: now(),
  };

  const [stat] = await drizzleDb
    .insert(fuelProductionStats)
    .values({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      operationalDate: input.operationalDate,
      shiftType: input.shiftType,
      ...values,
    })
    .onConflictDoUpdate({
      target: [
        fuelProductionStats.organizationId,
        fuelProductionStats.vehicleId,
        fuelProductionStats.operationalDate,
        fuelProductionStats.shiftType,
      ],
      set: values,
    })
    .returning();

  return stat;
};

export const getFuelProductionStats = async (
  organizationId: string,
  input: { from: string; to: string; vehicleId?: string },
) => {
  const conditions: SQL[] = [
    eq(fuelProductionStats.organizationId, organizationId),
    gte(fuelProductionStats.operationalDate, input.from),
    lte(fuelProductionStats.operationalDate, input.to),
  ];

  if (input.vehicleId) {
    conditions.push(eq(fuelProductionStats.vehicleId, input.vehicleId));
  }

  const rows = await drizzleDb
    .select({
      stat: fuelProductionStats,
      mineNumber: vehicles.mineNumber,
      vehicleName: vehicles.name,
      model: vehicles.model,
    })
    .from(fuelProductionStats)
    .innerJoin(vehicles, eq(vehicles.id, fuelProductionStats.vehicleId))
    .where(and(...conditions))
    .orderBy(asc(fuelProductionStats.operationalDate), asc(vehicles.mineNumber));

  return rows.map((r) => ({
    ...r.stat,
    mineNumber: r.mineNumber,
    vehicleName: r.vehicleName,
    model: r.model,
  }));
};

export const syncFuelProductionFromStratum = async (organizationId: string, from: string, to: string) => {
  assertRange(from, to, 93);

  type StatRow = { vehicleId: string; operationalDate: string; shiftType: ShiftType; tripCount: number; volumeM3: number };

  const keyOf = (r: { vehicleId: string; operationalDate: string; shiftType: string }) =>
    `${r.vehicleId}|${r.operationalDate}|${r.shiftType}`;

  const markshader = await drizzleDb
    .select({
      vehicleId: markshaderDailyReports.vehicleId,
      operationalDate: markshaderDailyReports.reportDate,
      shiftType: markshaderDailyReports.shiftType,
      tripCount: sql<number>`(COALESCE(${markshaderDailyReports.disReisSoil}, 0) + COALESCE(${markshaderDailyReports.disReisCoal}, 0))::int`,
      volumeM3: sql<string>`COALESCE(${markshaderDailyReports.disTotalProduction}, ${markshaderDailyReports.markProduction}, 0)`,
    })
    .from(markshaderDailyReports)
    .where(
      and(
        eq(markshaderDailyReports.organizationId, organizationId),
        gte(markshaderDailyReports.reportDate, from),
        lte(markshaderDailyReports.reportDate, to),
      ),
    );

  const shiftProducts = await drizzleDb
    .select({
      vehicleId: shifts.vehicleId,
      operationalDate: sql<string>`${shifts.operationalDate}::text`,
      shiftType: shifts.shiftType,
      volumeM3: sql<string>`COALESCE(SUM(COALESCE(${shifts.soilProduct}, 0) + COALESCE(${shifts.coalProduct}, 0)), 0)`,
    })
    .from(shifts)
    .where(
      and(
        eq(shifts.organizationId, organizationId),
        ne(shifts.status, 'cancelled'),
        gte(shifts.operationalDate, from),
        lte(shifts.operationalDate, to),
      ),
    )
    .groupBy(shifts.vehicleId, shifts.operationalDate, shifts.shiftType);

  const shiftTrips = await drizzleDb
    .select({
      vehicleId: shifts.vehicleId,
      operationalDate: sql<string>`${shifts.operationalDate}::text`,
      shiftType: shifts.shiftType,
      tripCount: sql<number>`COUNT(${workLogs.id})::int`,
    })
    .from(workLogs)
    .innerJoin(shifts, eq(shifts.id, workLogs.shiftId))
    .where(
      and(
        eq(shifts.organizationId, organizationId),
        ne(shifts.status, 'cancelled'),
        eq(workLogs.status, 'completed'),
        gte(shifts.operationalDate, from),
        lte(shifts.operationalDate, to),
      ),
    )
    .groupBy(shifts.vehicleId, shifts.operationalDate, shifts.shiftType);

  const merged = new Map<string, StatRow>();

  for (const r of shiftProducts) {
    merged.set(keyOf(r), {
      vehicleId: r.vehicleId,
      operationalDate: r.operationalDate,
      shiftType: r.shiftType,
      tripCount: 0,
      volumeM3: round(toNumber(r.volumeM3)),
    });
  }

  for (const r of shiftTrips) {
    const existing = merged.get(keyOf(r));

    if (existing) {
      existing.tripCount = Number(r.tripCount);
    } else {
      merged.set(keyOf(r), {
        vehicleId: r.vehicleId,
        operationalDate: r.operationalDate,
        shiftType: r.shiftType,
        tripCount: Number(r.tripCount),
        volumeM3: 0,
      });
    }
  }

  for (const r of markshader) {
    merged.set(keyOf(r), {
      vehicleId: r.vehicleId,
      operationalDate: r.operationalDate,
      shiftType: r.shiftType,
      tripCount: Number(r.tripCount),
      volumeM3: round(toNumber(r.volumeM3)),
    });
  }

  const protectedRows = await drizzleDb
    .select({
      vehicleId: fuelProductionStats.vehicleId,
      operationalDate: fuelProductionStats.operationalDate,
      shiftType: fuelProductionStats.shiftType,
    })
    .from(fuelProductionStats)
    .where(
      and(
        eq(fuelProductionStats.organizationId, organizationId),
        ne(fuelProductionStats.source, 'stratum'),
        gte(fuelProductionStats.operationalDate, from),
        lte(fuelProductionStats.operationalDate, to),
      ),
    );

  const protectedKeys = new Set(protectedRows.map(keyOf));
  const rows = [...merged.values()].filter((r) => !protectedKeys.has(keyOf(r)));

  await drizzleDb.transaction(async (tx) => {
    await tx
      .delete(fuelProductionStats)
      .where(
        and(
          eq(fuelProductionStats.organizationId, organizationId),
          eq(fuelProductionStats.source, 'stratum'),
          gte(fuelProductionStats.operationalDate, from),
          lte(fuelProductionStats.operationalDate, to),
        ),
      );

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);

      await tx.insert(fuelProductionStats).values(
        chunk.map((r) => ({
          organizationId,
          vehicleId: r.vehicleId,
          operationalDate: r.operationalDate,
          shiftType: r.shiftType,
          tripCount: r.tripCount,
          volumeM3: toNumeric(r.volumeM3),
          source: 'stratum' as const,
        })),
      );
    }
  });

  return { from, to, synced: rows.length, skippedManual: protectedKeys.size };
};