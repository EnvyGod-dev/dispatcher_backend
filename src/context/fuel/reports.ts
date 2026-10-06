import { drizzleDb } from '$/libs/database/db';

import {
  fuelAlerts,
  fuelAuditLogs,
  fuelIssues,
  fuelReceiptEditRequests,
  fuelReceipts,
  fuelRefuelings,
  fuelSuppliers,
  fuelTanks,
  users,
  vehicleOrganizations,
  vehicles,
} from '$/libs/database/schema';

import { getCrewResolver } from '$/context/crew-schedule';
import { CREW_LABELS, CREWS, type Crew } from '$/utils/crew-rotation';

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  type Granularity,
  L,
  toNumber,
  toNumberOrNull,
  round,
  assertRange,
} from './common';

import {
  getFuelHolderBalances,
} from './balances';

export const getFuelPeriodSummary = async (
  organizationId: string,
  from: string,
  to: string,
  granularity: Granularity = 'day',
) => {
  assertRange(from, to);

  const unit = ({ day: 'day', week: 'week', month: 'month' } as const)[granularity];
  const bucket = sql<string>`to_char(date_trunc('${sql.raw(unit)}', ${L.operationalDate}::timestamp), 'YYYY-MM-DD')`;

  const [opening] = await drizzleDb
    .select({
      tank: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.holderType} = 'tank'), 0)`,
      dispenser: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.holderType} = 'dispenser'), 0)`,
      equipment: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.holderType} = 'equipment'), 0)`,
    })
    .from(L)
    .where(and(eq(L.organizationId, organizationId), lt(L.operationalDate, from)));

  const buckets = await drizzleDb
    .select({
      bucket,
      received: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.entryType} = 'receipt'), 0)`,
      issued: sql<string>`COALESCE(-SUM(${L.delta}) FILTER (WHERE ${L.entryType} = 'issue' AND ${L.holderType} = 'tank'), 0)`,
      refueled: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.entryType} = 'refuel' AND ${L.holderType} = 'equipment'), 0)`,
      refueledFromTank: sql<string>`COALESCE(-SUM(${L.delta}) FILTER (WHERE ${L.entryType} = 'refuel' AND ${L.holderType} = 'tank'), 0)`,
      refueledFromDispenser: sql<string>`COALESCE(-SUM(${L.delta}) FILTER (WHERE ${L.entryType} = 'refuel' AND ${L.holderType} = 'dispenser'), 0)`,
      tankAdjustment: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.entryType} = 'adjustment' AND ${L.holderType} = 'tank'), 0)`,
      dispenserAdjustment: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.entryType} = 'adjustment' AND ${L.holderType} = 'dispenser'), 0)`,
      tankDelta: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.holderType} = 'tank'), 0)`,
      dispenserDelta: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.holderType} = 'dispenser'), 0)`,
      equipmentDelta: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.holderType} = 'equipment'), 0)`,
    })
    .from(L)
    .where(and(eq(L.organizationId, organizationId), gte(L.operationalDate, from), lte(L.operationalDate, to)))
    .groupBy(bucket)
    .orderBy(asc(bucket));

  let tankBalance = round(toNumber(opening?.tank));
  let dispenserBalance = round(toNumber(opening?.dispenser));
  let equipmentBalance = round(toNumber(opening?.equipment));

  const series = buckets.map((b) => {
    tankBalance = round(tankBalance + toNumber(b.tankDelta));
    dispenserBalance = round(dispenserBalance + toNumber(b.dispenserDelta));
    equipmentBalance = round(equipmentBalance + toNumber(b.equipmentDelta));

    return {
      bucket: b.bucket,
      received: round(toNumber(b.received)),
      issued: round(toNumber(b.issued)),
      refueled: round(toNumber(b.refueled)),
      refueledFromTank: round(toNumber(b.refueledFromTank)),
      refueledFromDispenser: round(toNumber(b.refueledFromDispenser)),
      tankAdjustment: round(toNumber(b.tankAdjustment)),
      dispenserAdjustment: round(toNumber(b.dispenserAdjustment)),
      tankClosing: tankBalance,
      dispenserClosing: dispenserBalance,
      equipmentClosing: equipmentBalance,
    };
  });

  const holders = await drizzleDb
    .select({
      holderType: L.holderType,
      tankId: L.tankId,
      vehicleId: L.vehicleId,
      opening: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.operationalDate} < ${from} OR (${L.entryType} = 'opening' AND ${L.operationalDate} BETWEEN ${from} AND ${to})), 0)`,
      inflow: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.operationalDate} BETWEEN ${from} AND ${to} AND ${L.delta} > 0 AND ${L.entryType} NOT IN ('opening', 'adjustment')), 0)`,
      outflow: sql<string>`COALESCE(-SUM(${L.delta}) FILTER (WHERE ${L.operationalDate} BETWEEN ${from} AND ${to} AND ${L.delta} < 0 AND ${L.entryType} NOT IN ('opening', 'adjustment')), 0)`,
      adjustment: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.operationalDate} BETWEEN ${from} AND ${to} AND ${L.entryType} = 'adjustment'), 0)`,
      closing: sql<string>`COALESCE(SUM(${L.delta}) FILTER (WHERE ${L.operationalDate} <= ${to}), 0)`,
    })
    .from(L)
    .where(eq(L.organizationId, organizationId))
    .groupBy(L.holderType, L.tankId, L.vehicleId);

  const tankIds = holders.map((h) => h.tankId).filter((id): id is string => !!id);
  const vehicleIds = holders.map((h) => h.vehicleId).filter((id): id is string => !!id);

  const [tankRows, vehicleRows] = await Promise.all([
    tankIds.length > 0
      ? drizzleDb.select({ id: fuelTanks.id, name: fuelTanks.name }).from(fuelTanks).where(inArray(fuelTanks.id, tankIds))
      : Promise.resolve([] as { id: string; name: string }[]),
    vehicleIds.length > 0
      ? drizzleDb
          .select({ id: vehicles.id, name: vehicles.name, mineNumber: vehicles.mineNumber, model: vehicles.model })
          .from(vehicles)
          .where(inArray(vehicles.id, vehicleIds))
      : Promise.resolve([] as { id: string; name: string; mineNumber: string | null; model: string | null }[]),
  ]);

  const tankBy = new Map(tankRows.map((t) => [t.id, t]));
  const vehicleBy = new Map(vehicleRows.map((v) => [v.id, v]));

  const holderRows = holders
    .map((h) => {
      const vehicle = h.vehicleId ? vehicleBy.get(h.vehicleId) : undefined;

      return {
        holderType: h.holderType,
        holderId: (h.tankId ?? h.vehicleId)!,
        name: h.tankId ? (tankBy.get(h.tankId)?.name ?? '—') : (vehicle?.name ?? '—'),
        mineNumber: vehicle?.mineNumber ?? null,
        model: vehicle?.model ?? null,
        opening: round(toNumber(h.opening)),
        inflow: round(toNumber(h.inflow)),
        outflow: round(toNumber(h.outflow)),
        adjustment: round(toNumber(h.adjustment)),
        closing: round(toNumber(h.closing)),
      };
    })
    .filter((h) => h.opening !== 0 || h.inflow !== 0 || h.outflow !== 0 || h.adjustment !== 0 || h.closing !== 0);

  const sum = (key: 'received' | 'issued' | 'refueled' | 'refueledFromTank' | 'refueledFromDispenser') =>
    round(series.reduce((s, b) => s + b[key], 0));

  return {
    from,
    to,
    granularity,
    totals: {
      received: sum('received'),
      issued: sum('issued'),
      refueled: sum('refueled'),
      refueledFromTank: sum('refueledFromTank'),
      refueledFromDispenser: sum('refueledFromDispenser'),
      tankOpening: round(holderRows.filter((h) => h.holderType === 'tank').reduce((s, h) => s + h.opening, 0)),
      dispenserOpening: round(holderRows.filter((h) => h.holderType === 'dispenser').reduce((s, h) => s + h.opening, 0)),
      tankClosing: tankBalance,
      dispenserClosing: dispenserBalance,
    },
    series,
    tanks: holderRows.filter((h) => h.holderType === 'tank'),
    dispensers: holderRows.filter((h) => h.holderType === 'dispenser'),
    equipment: holderRows.filter((h) => h.holderType === 'equipment').sort((a, b) => b.inflow - a.inflow),
  };
};

export const getFuelReceiptsBySupplier = async (organizationId: string, from: string, to: string) => {
  assertRange(from, to);

  const rows = await drizzleDb
    .select({
      supplierId: fuelSuppliers.id,
      supplierName: fuelSuppliers.name,
      fuelType: fuelReceipts.fuelType,
      receiptCount: sql<number>`COUNT(*)::int`,
      totalQuantity: sql<string>`SUM(${fuelReceipts.quantity})`,
      firstReceivedAt: sql<string>`MIN(${fuelReceipts.receivedAt})`,
      lastReceivedAt: sql<string>`MAX(${fuelReceipts.receivedAt})`,
    })
    .from(fuelReceipts)
    .innerJoin(fuelSuppliers, eq(fuelSuppliers.id, fuelReceipts.supplierId))
    .where(
      and(
        eq(fuelReceipts.organizationId, organizationId),
        isNull(fuelReceipts.cancelledAt),
        gte(fuelReceipts.operationalDate, from),
        lte(fuelReceipts.operationalDate, to),
      ),
    )
    .groupBy(fuelSuppliers.id, fuelSuppliers.name, fuelReceipts.fuelType)
    .orderBy(desc(sql`SUM(${fuelReceipts.quantity})`));

  const total = round(rows.reduce((s, r) => s + toNumber(r.totalQuantity), 0));

  return {
    from,
    to,
    total,
    rows: rows.map((r) => ({
      ...r,
      totalQuantity: round(toNumber(r.totalQuantity)),
      sharePercent: total > 0 ? round((toNumber(r.totalQuantity) / total) * 100, 1) : 0,
    })),
  };
};

export const getFuelDashboardSummary = async (organizationId: string, from: string, to: string) => {
  assertRange(from, to);

  const [receipts] = await drizzleDb
    .select({ total: sql<string>`COALESCE(SUM(${fuelReceipts.quantity}), 0)` })
    .from(fuelReceipts)
    .where(
      and(
        eq(fuelReceipts.organizationId, organizationId),
        gte(fuelReceipts.operationalDate, from),
        lte(fuelReceipts.operationalDate, to),
        isNull(fuelReceipts.cancelledAt),
      ),
    );

  const [issues] = await drizzleDb
    .select({ total: sql<string>`COALESCE(SUM(${fuelIssues.quantity}), 0)` })
    .from(fuelIssues)
    .where(
      and(
        eq(fuelIssues.organizationId, organizationId),
        gte(fuelIssues.operationalDate, from),
        lte(fuelIssues.operationalDate, to),
      ),
    );

  const [refuelings] = await drizzleDb
    .select({ total: sql<string>`COALESCE(SUM(${fuelRefuelings.quantity}), 0)` })
    .from(fuelRefuelings)
    .where(
      and(
        eq(fuelRefuelings.organizationId, organizationId),
        isNull(fuelRefuelings.cancelledAt),
        gte(fuelRefuelings.operationalDate, from),
        lte(fuelRefuelings.operationalDate, to),
      ),
    );

  const [alerts] = await drizzleDb
    .select({ open: sql<number>`COUNT(*)::int` })
    .from(fuelAlerts)
    .where(and(eq(fuelAlerts.organizationId, organizationId), eq(fuelAlerts.status, 'open')));

  const [pendingRequests] = await drizzleDb
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(fuelReceiptEditRequests)
    .where(and(eq(fuelReceiptEditRequests.organizationId, organizationId), eq(fuelReceiptEditRequests.status, 'pending')));

  const [failedEmails] = await drizzleDb
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(fuelReceipts)
    .where(
      and(
        eq(fuelReceipts.organizationId, organizationId),
        eq(fuelReceipts.emailStatus, 'failed'),
        isNull(fuelReceipts.cancelledAt),
      ),
    );

  const [tankBalances, dispenserBalances] = await Promise.all([
    getFuelHolderBalances(organizationId, 'tank'),
    getFuelHolderBalances(organizationId, 'dispenser'),
  ]);

  return {
    summary: {
      total_receipts: round(toNumber(receipts?.total)),
      total_issues: round(toNumber(issues?.total)),
      total_refuelings: round(toNumber(refuelings?.total)),
      open_alerts: alerts?.open ?? 0,
      pending_edit_requests: pendingRequests?.count ?? 0,
      failed_act_emails: failedEmails?.count ?? 0,
      tank_total_balance: round(tankBalances.reduce((s, t) => s + t.balance, 0)),
      dispenser_total_balance: round(dispenserBalances.reduce((s, d) => s + d.balance, 0)),
    },
    tankBalances,
    dispenserBalances,
  };
};

export const getFuelAuditLogs = async (
  organizationId: string,
  input?: { entityType?: string; entityId?: string; limit?: number },
) => {
  const conditions: SQL[] = [eq(fuelAuditLogs.organizationId, organizationId)];

  if (input?.entityType) {
    conditions.push(eq(fuelAuditLogs.entityType, input.entityType));
  }

  if (input?.entityId) {
    conditions.push(eq(fuelAuditLogs.entityId, input.entityId));
  }

  const rows = await drizzleDb
    .select({
      log: fuelAuditLogs,
      userName: sql<string | null>`COALESCE(${users.firstName}, ${users.name})`,
      userRole: users.role,
    })
    .from(fuelAuditLogs)
    .leftJoin(users, eq(users.id, fuelAuditLogs.userId))
    .where(and(...conditions))
    .orderBy(desc(fuelAuditLogs.createdAt))
    .limit(Math.min(input?.limit ?? 100, 500));

  return rows.map((r) => ({ ...r.log, userName: r.userName, userRole: r.userRole }));
};
/**
 * Зарлагын (олголтын) тайлан: техник тус бүр, өдөр/ээлж, эх үүсвэрээр (агуулах, түгээгч машин).
 * Төрөл, марк, эзэмшигчээр бүлэглэхийг client хийнэ.
 */
export const getFuelRefuelBreakdown = async (organizationId: string, from: string, to: string) => {
  assertRange(from, to);

  const resolver = await getCrewResolver(organizationId, from, to);

  const rows = await drizzleDb
    .select({
      receiverVehicleId: fuelRefuelings.receiverVehicleId,
      operationalDate: fuelRefuelings.operationalDate,
      shiftType: fuelRefuelings.shiftType,
      quantity: fuelRefuelings.quantity,
      sourceType: fuelRefuelings.sourceType,
      tankId: fuelRefuelings.tankId,
      dispenserVehicleId: fuelRefuelings.dispenserVehicleId,
      meterStart: fuelRefuelings.meterStart,
      meterEnd: fuelRefuelings.meterEnd,
      tankName: fuelTanks.name,
      mineNumber: vehicles.mineNumber,
      vehicleName: vehicles.name,
      vehicleNumber: vehicles.vehicleNumber,
      model: vehicles.model,
      type: vehicles.type,
      owner: vehicleOrganizations.name,
      dispenserMineNumber: sql<string | null>`(SELECT d.mine_number FROM vehicles d WHERE d.id = ${fuelRefuelings.dispenserVehicleId})`,
    })
    .from(fuelRefuelings)
    .innerJoin(vehicles, eq(vehicles.id, fuelRefuelings.receiverVehicleId))
    .leftJoin(vehicleOrganizations, eq(vehicleOrganizations.id, vehicles.vehicleOrganizationId))
    .leftJoin(fuelTanks, eq(fuelTanks.id, fuelRefuelings.tankId))
    .where(
      and(
        eq(fuelRefuelings.organizationId, organizationId),
        isNull(fuelRefuelings.cancelledAt),
        gte(fuelRefuelings.operationalDate, from),
        lte(fuelRefuelings.operationalDate, to),
      ),
    );

  const vehicleMap = new Map<
    string,
    {
      vehicleId: string;
      mineNumber: string | null;
      name: string;
      vehicleNumber: string | null;
      model: string | null;
      type: string | null;
      owner: string | null;
      liters: number;
      count: number;
      day: number;
      night: number;
    }
  >();
  const dayMap = new Map<string, { date: string; day: number; night: number; other: number }>();
  const sourceMap = new Map<string, { key: string; label: string; kind: string; liters: number; count: number; meterGap: number }>();
  const crewMap = new Map<Crew, { liters: number; count: number; vehicles: Set<string> }>();
  let total = 0;
  let day = 0;
  let night = 0;

  for (const r of rows) {
    const liters = toNumber(r.quantity);
    total += liters;

    const v = vehicleMap.get(r.receiverVehicleId) ?? {
      vehicleId: r.receiverVehicleId,
      mineNumber: r.mineNumber,
      name: r.vehicleName,
      vehicleNumber: r.vehicleNumber,
      model: r.model,
      type: r.type,
      owner: r.owner,
      liters: 0,
      count: 0,
      day: 0,
      night: 0,
    };
    v.liters += liters;
    v.count += 1;

    const d = dayMap.get(r.operationalDate) ?? { date: r.operationalDate, day: 0, night: 0, other: 0 };

    if (r.shiftType === 'day') {
      v.day += liters;
      d.day += liters;
      day += liters;
    } else if (r.shiftType === 'night') {
      v.night += liters;
      d.night += liters;
      night += liters;
    } else {
      d.other += liters;
    }

    vehicleMap.set(r.receiverVehicleId, v);
    dayMap.set(r.operationalDate, d);

    const crew = resolver.crewFor(r.operationalDate, r.shiftType);

    if (crew) {
      const c = crewMap.get(crew) ?? { liters: 0, count: 0, vehicles: new Set<string>() };
      c.liters += liters;
      c.count += 1;
      c.vehicles.add(r.receiverVehicleId);
      crewMap.set(crew, c);
    }

    const key = r.sourceType === 'tank' ? `tank:${r.tankId}` : `dispenser:${r.dispenserVehicleId}`;
    const s = sourceMap.get(key) ?? {
      key,
      label: (r.sourceType === 'tank' ? r.tankName : r.dispenserMineNumber) ?? '—',
      kind: r.sourceType,
      liters: 0,
      count: 0,
      meterGap: 0,
    };
    s.liters += liters;
    s.count += 1;

    // Тоолуураар тооцсон хэмжээ ба бүртгэсэн литрийн зөрүү.
    const ms = toNumberOrNull(r.meterStart);
    const me = toNumberOrNull(r.meterEnd);

    if (ms !== null && me !== null) {
      s.meterGap += me - ms - liters;
    }

    sourceMap.set(key, s);
  }

  const r1 = (n: number) => round(n, 1);

  return {
    from,
    to,
    total: r1(total),
    day: r1(day),
    night: r1(night),
    count: rows.length,
    daysWithRefuel: dayMap.size,
    days: [...dayMap.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date,
        day: r1(d.day),
        night: r1(d.night),
        other: r1(d.other),
        dayCrew: resolver.crewFor(d.date, 'day'),
        nightCrew: resolver.crewFor(d.date, 'night'),
      })),
    /** Ээлжээр (А/Б/В/Г): ажлын өдөр, ээлжийн төрлөөс автоматаар тооцсон. */
    crews: CREWS.map((crew) => {
      const c = crewMap.get(crew);

      return {
        crew,
        label: CREW_LABELS[crew],
        liters: r1(c?.liters ?? 0),
        count: c?.count ?? 0,
        vehicles: c?.vehicles.size ?? 0,
      };
    }),
    vehicles: [...vehicleMap.values()]
      .map((v) => ({ ...v, liters: r1(v.liters), day: r1(v.day), night: r1(v.night) }))
      .sort((a, b) => b.liters - a.liters),
    sources: [...sourceMap.values()]
      .map((s) => ({ ...s, liters: r1(s.liters), meterGap: r1(s.meterGap) }))
      .sort((a, b) => b.liters - a.liters),
  };
};
