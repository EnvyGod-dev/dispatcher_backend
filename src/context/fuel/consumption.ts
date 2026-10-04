import { drizzleDb } from '$/libs/database/db';

import {
  fuelNorms,
  fuelProductionStats,
  fuelRefuelings,
  vehicles,
} from '$/libs/database/schema';

import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  type ShiftType,
  type BaselineSource,
  toNumber,
  toNumberOrNull,
  round,
  addDays,
  assertRange,
  vehicleGroupKey,
} from './common';

import {
  ensureFuelSettings,
} from './lookups';

type MetricResult = {
  actual: number | null;
  groupAverage: number | null;
  norm: number | null;
  baseline: number | null;
  baselineSource: BaselineSource | null;
  deviationPercent: number | null;
  exceeds: boolean;
};

export type ConsumptionRow = {
  vehicleId: string;
  mineNumber: string | null;
  name: string;
  model: string | null;
  type: string | null;
  groupKey: string;
  totalRefueled: number;
  tripCount: number;
  volumeM3: number;
  thresholdPercent: number;
  perTrip: MetricResult;
  perM3: MetricResult;
};

type ConsumptionGroup = {
  groupKey: string;
  vehicleCount: number;
  totalRefueled: number;
  tripCount: number;
  volumeM3: number;
  avgLitersPerTrip: number | null;
  avgLitersPerM3: number | null;
  normLitersPerTrip: number | null;
  normLitersPerM3: number | null;
  thresholdPercent: number;
};

export const computeFuelConsumption = async (
  organizationId: string,
  from: string,
  to: string,
  filter: { vehicleId?: string; vehicleModel?: string; vehicleType?: string; shiftType?: ShiftType } = {},
) => {
  assertRange(from, to);

  const settings = await ensureFuelSettings(drizzleDb, organizationId);
  const defaultThreshold = toNumber(settings.defaultThresholdPercent);

  const normRows = await drizzleDb
    .select()
    .from(fuelNorms)
    .where(and(eq(fuelNorms.organizationId, organizationId), eq(fuelNorms.isActive, true)));

  const norms = new Map(
    normRows.map((n) => [
      n.vehicleModel,
      {
        perTrip: toNumberOrNull(n.targetLitersPerTrip),
        perM3: toNumberOrNull(n.targetLitersPerM3),
        threshold: toNumberOrNull(n.thresholdPercent),
      },
    ]),
  );

  const refuelConditions: SQL[] = [
    eq(fuelRefuelings.organizationId, organizationId),
    isNull(fuelRefuelings.cancelledAt),
    gte(fuelRefuelings.operationalDate, from),
    lte(fuelRefuelings.operationalDate, to),
  ];

  const productionConditions: SQL[] = [
    eq(fuelProductionStats.organizationId, organizationId),
    gte(fuelProductionStats.operationalDate, from),
    lte(fuelProductionStats.operationalDate, to),
  ];

  if (filter.shiftType) {
    refuelConditions.push(eq(fuelRefuelings.shiftType, filter.shiftType));
    productionConditions.push(eq(fuelProductionStats.shiftType, filter.shiftType));
  }

  const refuels = await drizzleDb
    .select({
      vehicleId: fuelRefuelings.receiverVehicleId,
      total: sql<string>`SUM(${fuelRefuelings.quantity})`,
    })
    .from(fuelRefuelings)
    .where(and(...refuelConditions))
    .groupBy(fuelRefuelings.receiverVehicleId);

  const production = await drizzleDb
    .select({
      vehicleId: fuelProductionStats.vehicleId,
      trips: sql<number>`SUM(${fuelProductionStats.tripCount})::int`,
      volume: sql<string>`SUM(${fuelProductionStats.volumeM3})`,
    })
    .from(fuelProductionStats)
    .where(and(...productionConditions))
    .groupBy(fuelProductionStats.vehicleId);

  const ids = [...new Set([...refuels.map((r) => r.vehicleId), ...production.map((p) => p.vehicleId)])];

  if (ids.length === 0) {
    return { from, to, rows: [] as ConsumptionRow[], groups: [] as ConsumptionGroup[] };
  }

  const vehicleRows = await drizzleDb
    .select({
      id: vehicles.id,
      name: vehicles.name,
      mineNumber: vehicles.mineNumber,
      model: vehicles.model,
      type: vehicles.type,
    })
    .from(vehicles)
    .where(and(eq(vehicles.organizationId, organizationId), inArray(vehicles.id, ids)));

  const refuelBy = new Map(refuels.map((r) => [r.vehicleId, round(toNumber(r.total))]));
  const productionBy = new Map(
    production.map((p) => [p.vehicleId, { trips: Number(p.trips), volume: round(toNumber(p.volume)) }]),
  );

  const base = vehicleRows.map((v) => ({
    vehicle: v,
    groupKey: vehicleGroupKey(v),
    totalRefueled: refuelBy.get(v.id) ?? 0,
    tripCount: productionBy.get(v.id)?.trips ?? 0,
    volumeM3: productionBy.get(v.id)?.volume ?? 0,
  }));

  const groupAgg = new Map<
    string,
    {
      vehicles: number;
      tripVehicles: number;
      volumeVehicles: number;
      refuelTrip: number;
      trips: number;
      refuelVolume: number;
      volume: number;
      refuelTotal: number;
    }
  >();

  for (const b of base) {
    const g = groupAgg.get(b.groupKey) ?? {
      vehicles: 0,
      tripVehicles: 0,
      volumeVehicles: 0,
      refuelTrip: 0,
      trips: 0,
      refuelVolume: 0,
      volume: 0,
      refuelTotal: 0,
    };

    g.vehicles += 1;
    g.refuelTotal += b.totalRefueled;

    if (b.tripCount > 0 && b.totalRefueled > 0) {
      g.tripVehicles += 1;
      g.refuelTrip += b.totalRefueled;
      g.trips += b.tripCount;
    }

    if (b.volumeM3 > 0 && b.totalRefueled > 0) {
      g.volumeVehicles += 1;
      g.refuelVolume += b.totalRefueled;
      g.volume += b.volumeM3;
    }

    groupAgg.set(b.groupKey, g);
  }

  const groups: ConsumptionGroup[] = [...groupAgg.entries()].map(([groupKey, g]) => {
    const norm = norms.get(groupKey);

    return {
      groupKey,
      vehicleCount: g.vehicles,
      totalRefueled: round(g.refuelTotal),
      tripCount: g.trips,
      volumeM3: round(g.volume),
      avgLitersPerTrip: g.trips > 0 ? round(g.refuelTrip / g.trips, 3) : null,
      avgLitersPerM3: g.volume > 0 ? round(g.refuelVolume / g.volume, 4) : null,
      normLitersPerTrip: norm?.perTrip ?? null,
      normLitersPerM3: norm?.perM3 ?? null,
      thresholdPercent: norm?.threshold ?? defaultThreshold,
    };
  });

  const groupBy = new Map(groups.map((g) => [g.groupKey, g]));

  const metric = (
    actual: number | null,
    groupAverage: number | null,
    contributingVehicles: number,
    norm: number | null,
    threshold: number,
  ): MetricResult => {
    const useGroup = groupAverage !== null && contributingVehicles >= 2;
    const baseline = useGroup ? groupAverage : norm;
    const baselineSource: BaselineSource | null = useGroup ? 'group_average' : norm !== null ? 'norm' : null;
    const deviationPercent =
      actual === null || baseline === null || baseline === 0 ? null : round(((actual - baseline) / baseline) * 100, 2);

    return {
      actual,
      groupAverage,
      norm,
      baseline,
      baselineSource,
      deviationPercent,
      exceeds: deviationPercent !== null && deviationPercent > threshold,
    };
  };

  const rows: ConsumptionRow[] = base
    .filter((b) => {
      if (filter.vehicleId && b.vehicle.id !== filter.vehicleId) {
        return false;
      }

      if (filter.vehicleModel && b.vehicle.model !== filter.vehicleModel) {
        return false;
      }

      if (filter.vehicleType && b.vehicle.type !== filter.vehicleType) {
        return false;
      }

      return true;
    })
    .map((b) => {
      const g = groupBy.get(b.groupKey)!;
      const agg = groupAgg.get(b.groupKey)!;
      const perTrip = b.tripCount > 0 && b.totalRefueled > 0 ? round(b.totalRefueled / b.tripCount, 3) : null;
      const perM3 = b.volumeM3 > 0 && b.totalRefueled > 0 ? round(b.totalRefueled / b.volumeM3, 4) : null;

      return {
        vehicleId: b.vehicle.id,
        mineNumber: b.vehicle.mineNumber,
        name: b.vehicle.name,
        model: b.vehicle.model,
        type: b.vehicle.type,
        groupKey: b.groupKey,
        totalRefueled: b.totalRefueled,
        tripCount: b.tripCount,
        volumeM3: b.volumeM3,
        thresholdPercent: g.thresholdPercent,
        perTrip: metric(perTrip, g.avgLitersPerTrip, agg.tripVehicles, g.normLitersPerTrip, g.thresholdPercent),
        perM3: metric(perM3, g.avgLitersPerM3, agg.volumeVehicles, g.normLitersPerM3, g.thresholdPercent),
      };
    })
    .sort((a, b) => (b.perTrip.deviationPercent ?? -Infinity) - (a.perTrip.deviationPercent ?? -Infinity));

  return { from, to, rows, groups };
};

export const getFuelConsumptionReport = async (
  organizationId: string,
  from: string,
  to: string,
  filter?: { vehicleId?: string; vehicleModel?: string; vehicleType?: string; shiftType?: ShiftType },
) => {
  return computeFuelConsumption(organizationId, from, to, filter);
};

export const getFuelConsumptionTimeseries = async (
  organizationId: string,
  vehicleId: string,
  from: string,
  to: string,
) => {
  assertRange(from, to);

  const refuels = await drizzleDb
    .select({
      date: fuelRefuelings.operationalDate,
      total: sql<string>`SUM(${fuelRefuelings.quantity})`,
    })
    .from(fuelRefuelings)
    .where(
      and(
        eq(fuelRefuelings.organizationId, organizationId),
        isNull(fuelRefuelings.cancelledAt),
        eq(fuelRefuelings.receiverVehicleId, vehicleId),
        gte(fuelRefuelings.operationalDate, from),
        lte(fuelRefuelings.operationalDate, to),
      ),
    )
    .groupBy(fuelRefuelings.operationalDate);

  const production = await drizzleDb
    .select({
      date: fuelProductionStats.operationalDate,
      trips: sql<number>`SUM(${fuelProductionStats.tripCount})::int`,
      volume: sql<string>`SUM(${fuelProductionStats.volumeM3})`,
    })
    .from(fuelProductionStats)
    .where(
      and(
        eq(fuelProductionStats.organizationId, organizationId),
        eq(fuelProductionStats.vehicleId, vehicleId),
        gte(fuelProductionStats.operationalDate, from),
        lte(fuelProductionStats.operationalDate, to),
      ),
    )
    .groupBy(fuelProductionStats.operationalDate);

  const refuelBy = new Map(refuels.map((r) => [r.date, round(toNumber(r.total))]));
  const productionBy = new Map(production.map((p) => [p.date, { trips: Number(p.trips), volume: round(toNumber(p.volume)) }]));
  const result: {
    date: string;
    refueled: number;
    tripCount: number;
    volumeM3: number;
    litersPerTrip: number | null;
    litersPerM3: number | null;
  }[] = [];

  for (let date = from; date <= to; date = addDays(date, 1)) {
    const refueled = refuelBy.get(date) ?? 0;
    const tripCount = productionBy.get(date)?.trips ?? 0;
    const volumeM3 = productionBy.get(date)?.volume ?? 0;

    result.push({
      date,
      refueled,
      tripCount,
      volumeM3,
      litersPerTrip: tripCount > 0 && refueled > 0 ? round(refueled / tripCount, 3) : null,
      litersPerM3: volumeM3 > 0 && refueled > 0 ? round(refueled / volumeM3, 4) : null,
    });
  }

  return result;
};