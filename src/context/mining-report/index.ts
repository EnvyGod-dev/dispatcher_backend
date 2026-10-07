import { drizzleDb } from '$/libs/database/db';
import {
  dailyPlans,
  equipmentShiftLogs,
  fuelRefuelings,
  markshaderDailyReports,
  miningBlocks,
  shifts,
  stockpiles,
  users,
  vehicleOrganizations,
  vehicles,
  workLogs,
} from '$/libs/database/schema';
import { getCrewCalendar, getCrewResolver } from '$/context/crew-schedule';
import { CREW_LABELS, CREWS, type Crew } from '$/utils/crew-rotation';
import { ClientError } from '$/utils/errors';
import { DATE_ONLY_PATTERN } from '$/utils/operational-date';
import { and, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export const MINING_REPORT_MAX_DAYS = 93;

const num = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const numOrNull = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value: number, digits = 1) => {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/** Хуваагч 0 бол null (тайланд "—" гэж харагдана). */
const ratio = (a: number, b: number, digits = 2) => (b > 0 ? round(a / b, digits) : null);

const percent = (a: number, b: number) => (b > 0 ? round((a / b) * 100, 1) : null);

type ShiftType = 'day' | 'night';

/** Бүтээлийн нийлбэр (ээлж, өдөр, ээлжийн бригад гэх мэт бүх түвшинд ашиглана). */
class Agg {
  shifts = 0;
  trucks = new Set<string>();
  operators = new Set<string>();
  trips = 0;
  coalTrips = 0;
  soilTrips = 0;
  coalM3 = 0;
  soilM3 = 0;
  motoHours = 0;
  km = 0;
  fuelLiters = 0;
  planM3 = 0;

  get totalM3() {
    return this.coalM3 + this.soilM3;
  }

  result() {
    const totalM3 = this.totalM3;

    return {
      shifts: this.shifts,
      trucks: this.trucks.size,
      operators: this.operators.size,
      trips: this.trips,
      coalTrips: this.coalTrips,
      soilTrips: this.soilTrips,
      coalM3: round(this.coalM3, 1),
      soilM3: round(this.soilM3, 1),
      totalM3: round(totalM3, 1),
      motoHours: round(this.motoHours, 1),
      km: round(this.km, 1),
      fuelLiters: round(this.fuelLiters, 1),
      planM3: round(this.planM3, 1),
      planPercent: percent(totalM3, this.planM3),
      /** Хөрс хуулалтын коэффициент: хөрс м³ / нүүрс м³. */
      strippingRatio: ratio(this.soilM3, this.coalM3),
      litersPerM3: ratio(this.fuelLiters, totalM3),
      litersPerTrip: ratio(this.fuelLiters, this.trips),
      litersPerMotoHour: ratio(this.fuelLiters, this.motoHours),
      tripsPerShift: ratio(this.trips, this.shifts, 1),
      m3PerShift: ratio(totalM3, this.shifts, 1),
      m3PerMotoHour: ratio(totalM3, this.motoHours, 1),
    };
  }
}

export type MiningMetrics = ReturnType<Agg['result']>;

const assertRange = (from: string, to: string) => {
  if (!DATE_ONLY_PATTERN.test(from) || !DATE_ONLY_PATTERN.test(to)) {
    throw new ClientError('Огноо буруу байна.');
  }

  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

  if (Number.isNaN(days) || days < 0) {
    throw new ClientError('Эхлэх огноо дуусах огнооноос хойш байна.');
  }

  if (days > MINING_REPORT_MAX_DAYS) {
    throw new ClientError(`Хугацаа ${MINING_REPORT_MAX_DAYS} хоногоос ихгүй байна.`);
  }
};

const personName = (first: string | null, last: string | null, fallback: string | null) => {
  const name = [last?.trim() ? `${last.trim().charAt(0)}.` : '', first?.trim() ?? ''].join('').trim();

  return name || fallback || '—';
};

/**
 * Нэмэлт мэдээлэл (экскаваторын цаг, маркшейдер, төлөвлөгөө) ачаалахад алдаа гарвал
 * тайланг бүхэлд нь унагахгүй, хоосон буцааж анхааруулга нэмнэ.
 */
const optional = async <T>(query: PromiseLike<T[]>, label: string, warnings: string[]): Promise<T[]> => {
  try {
    return await query;
  } catch (error) {
    console.error(`[mining-report] ${label} ачаалж чадсангүй`, error);
    warnings.push(`${label} ачаалж чадсангүй.`);
    return [];
  }
};

/**
 * Уулын ажлын тайлан: сонгосон хугацааны бүтээлийг ээлж (А/Б/В/Г), өдөр, экскаватор,
 * автосамосвал, буулгах цэг, блокоор задалж, түлш, төлөвлөгөө, маркшейдерийн хэмжилттэй харьцуулна.
 *
 * Ээлжийг (бригад) хуваариас (вебээс оруулсан, эсвэл үндсэн дүрэм) ажлын өдөр, ээлжийн төрлөөр тооцно.
 */
export const getMiningReport = async ({
  organizationId,
  from,
  to,
}: {
  organizationId: string;
  from: string;
  to: string;
}) => {
  assertRange(from, to);

  const [resolver, calendar] = await Promise.all([
    getCrewResolver(organizationId, from, to),
    getCrewCalendar(organizationId, from, to),
  ]);

  const excavator = alias(vehicles, 'excavator');
  const warnings: string[] = [];

  const [shiftRows, logRows, refuelRows, equipmentRows, markRows, planRows] = await Promise.all([
    drizzleDb
      .select({
        id: shifts.id,
        driverId: shifts.driverId,
        vehicleId: shifts.vehicleId,
        shiftType: shifts.shiftType,
        operationalDate: shifts.operationalDate,
        status: shifts.status,
        motoStart: shifts.motoStart,
        motoEnd: shifts.motoEnd,
        mileageStart: shifts.mileageStart,
        mileageEnd: shifts.mileageEnd,
        coalProduct: shifts.coalProduct,
        soilProduct: shifts.soilProduct,
        storedCrew: shifts.driverShiftGroup,
        vehicleCode: vehicles.code,
        vehicleMineNumber: vehicles.mineNumber,
        vehicleName: vehicles.name,
        vehicleModel: vehicles.model,
        vehicleType: vehicles.type,
        coalCoefficient: vehicles.coalCoefficient,
        soilCoefficient: vehicles.soilCoefficient,
        owner: vehicleOrganizations.name,
        driverFirstName: users.firstName,
        driverLastName: users.lastName,
        driverName: users.name,
      })
      .from(shifts)
      .innerJoin(vehicles, eq(vehicles.id, shifts.vehicleId))
      .leftJoin(vehicleOrganizations, eq(vehicleOrganizations.id, vehicles.vehicleOrganizationId))
      .leftJoin(users, eq(users.id, shifts.driverId))
      .where(
        and(
          eq(shifts.organizationId, organizationId),
          ne(shifts.status, 'cancelled'),
          gte(shifts.operationalDate, from),
          lte(shifts.operationalDate, to),
        ),
      ),

    drizzleDb
      .select({
        shiftId: workLogs.shiftId,
        stockpileType: stockpiles.type,
        stockpileLayer: stockpiles.layerNumber,
        excavatorId: dailyPlans.vehicleId,
        excavatorCode: excavator.code,
        excavatorName: excavator.name,
        blockName: miningBlocks.name,
        blockLayer: miningBlocks.layerNumber,
      })
      .from(workLogs)
      .innerJoin(shifts, eq(shifts.id, workLogs.shiftId))
      .leftJoin(stockpiles, eq(stockpiles.id, workLogs.stockpileId))
      .leftJoin(dailyPlans, eq(dailyPlans.id, workLogs.planId))
      .leftJoin(excavator, eq(excavator.id, dailyPlans.vehicleId))
      .leftJoin(miningBlocks, eq(miningBlocks.id, dailyPlans.pickUpBlockId))
      .where(
        and(
          eq(shifts.organizationId, organizationId),
          ne(shifts.status, 'cancelled'),
          ne(workLogs.status, 'cancelled'),
          gte(shifts.operationalDate, from),
          lte(shifts.operationalDate, to),
        ),
      ),

    drizzleDb
      .select({
        receiverVehicleId: fuelRefuelings.receiverVehicleId,
        operationalDate: fuelRefuelings.operationalDate,
        shiftType: fuelRefuelings.shiftType,
        quantity: fuelRefuelings.quantity,
      })
      .from(fuelRefuelings)
      .where(
        and(
          eq(fuelRefuelings.organizationId, organizationId),
          isNull(fuelRefuelings.cancelledAt),
          gte(fuelRefuelings.operationalDate, from),
          lte(fuelRefuelings.operationalDate, to),
        ),
      ),

    optional(
      drizzleDb
      .select({
        vehicleId: equipmentShiftLogs.vehicleId,
        totalHours: equipmentShiftLogs.totalHours,
        workedHours: equipmentShiftLogs.workedHours,
        repairHours: equipmentShiftLogs.repairHours,
        idleHours: equipmentShiftLogs.idleHours,
        code: vehicles.code,
        name: vehicles.name,
      })
      .from(equipmentShiftLogs)
      .innerJoin(vehicles, eq(vehicles.id, equipmentShiftLogs.vehicleId))
      .where(
        and(
          eq(equipmentShiftLogs.organizationId, organizationId),
          gte(equipmentShiftLogs.operationalDate, from),
          lte(equipmentShiftLogs.operationalDate, to),
        ),
      ),
      'Экскаваторын цагийн бүртгэл',
      warnings,
    ),

    optional(
      drizzleDb
      .select({
        vehicleId: markshaderDailyReports.vehicleId,
        markProduction: markshaderDailyReports.markProduction,
      })
      .from(markshaderDailyReports)
      .where(
        and(
          eq(markshaderDailyReports.organizationId, organizationId),
          gte(markshaderDailyReports.reportDate, from),
          lte(markshaderDailyReports.reportDate, to),
        ),
      ),
      'Маркшейдерийн хэмжилт',
      warnings,
    ),

    optional(
      drizzleDb
      .select({
        date: dailyPlans.date,
        shiftType: dailyPlans.shiftType,
        transportAmount: dailyPlans.transportAmount,
        isCoal: sql<boolean>`EXISTS (SELECT 1 FROM ${stockpiles} s WHERE s.id = ANY(${dailyPlans.stockpileIds}) AND s.type = 'coal')`,
      })
      .from(dailyPlans)
      .where(
        and(
          eq(dailyPlans.organizationId, organizationId),
          gte(dailyPlans.date, from),
          lte(dailyPlans.date, to),
        ),
      ),
      'Төлөвлөгөө',
      warnings,
    ),
  ]);

  // ── Рейсүүдийг ээлжээр бүлэглэх ─────────────────────────
  const logsByShift = new Map<string, typeof logRows>();

  for (const log of logRows) {
    const list = logsByShift.get(log.shiftId) ?? [];
    list.push(log);
    logsByShift.set(log.shiftId, list);
  }

  // ── Нийлбэрүүд ──────────────────────────────────────────
  const totals = new Agg();
  const crews = new Map<Crew, Agg>();
  const crewShiftTypes = new Map<Crew, { day: number; night: number }>();
  const dayMap = new Map<string, { day: Agg; night: Agg }>();
  const truckMap = new Map<
    string,
    { agg: Agg; code: string | null; name: string; model: string | null; type: string | null; owner: string | null }
  >();
  const operatorMap = new Map<string, { agg: Agg; name: string; crews: Map<Crew, number> }>();
  const excavatorMap = new Map<
    string,
    { code: string | null; name: string; trips: number; coalM3: number; soilM3: number; trucks: Set<string> }
  >();
  const destinationMap = new Map<string, { type: string; layer: string | null; trips: number; m3: number }>();
  const blockMap = new Map<string, { name: string; layer: string | null; trips: number; m3: number }>();

  const crewAgg = (crew: Crew) => {
    let agg = crews.get(crew);

    if (!agg) {
      agg = new Agg();
      crews.set(crew, agg);
    }

    return agg;
  };

  const dayAgg = (date: string, shiftType: ShiftType) => {
    let entry = dayMap.get(date);

    if (!entry) {
      entry = { day: new Agg(), night: new Agg() };
      dayMap.set(date, entry);
    }

    return entry[shiftType];
  };

  /** Шөнийн ээлжийн шилдэг оператор, машин, экскаватор (м³, рейс). */
  type Best = { name: string; code: string | null; m3: number; trips: number };
  const nightOperators = new Map<string, Best>();
  const nightTrucks = new Map<string, Best>();
  const nightExcavators = new Map<string, Best>();
  /** Ээлж (А/Б/В/Г) бүрийн оператор: `${crew}|${driverId}` → бүтээл, рейс. */
  const crewOperators = new Map<string, Best & { crew: Crew; driverId: string; shifts: number }>();
  const addBest = (map: Map<string, Best>, id: string, name: string, code: string | null, m3: number, trips: number) => {
    const entry = map.get(id) ?? { name, code, m3: 0, trips: 0 };
    entry.m3 += m3;
    entry.trips += trips;
    map.set(id, entry);
  };

  /** Тухайн ажлын өдөр/ээлж дээрх техник → оператор (түлшийг хамааруулахад). */
  const driverByVehicleSlot = new Map<string, string>();

  for (const shift of shiftRows) {
    const date = shift.operationalDate;

    if (!date) continue;

    const shiftType: ShiftType = shift.shiftType === 'night' ? 'night' : 'day';
    const crew = resolver.crewFor(date, shiftType);
    const logs = logsByShift.get(shift.id) ?? [];
    const coalTrips = logs.filter((l) => l.stockpileType === 'coal').length;
    const soilTrips = logs.filter((l) => l.stockpileType === 'soil').length;

    // Дууссан ээлжид хадгалсан бүтээлийг, явагдаж буй ээлжид коэффициентоор тооцно.
    const storedCoal = numOrNull(shift.coalProduct);
    const storedSoil = numOrNull(shift.soilProduct);
    const coalM3 = storedCoal ?? coalTrips * num(shift.coalCoefficient);
    const soilM3 = storedSoil ?? soilTrips * num(shift.soilCoefficient);
    const coalPerTrip = coalTrips > 0 ? coalM3 / coalTrips : 0;
    const soilPerTrip = soilTrips > 0 ? soilM3 / soilTrips : 0;

    const motoStart = numOrNull(shift.motoStart);
    const motoEnd = numOrNull(shift.motoEnd);
    const kmStart = numOrNull(shift.mileageStart);
    const kmEnd = numOrNull(shift.mileageEnd);
    const motoHours = motoStart !== null && motoEnd !== null && motoEnd >= motoStart ? motoEnd - motoStart : 0;
    const km = kmStart !== null && kmEnd !== null && kmEnd >= kmStart ? kmEnd - kmStart : 0;

    const truck = truckMap.get(shift.vehicleId) ?? {
      agg: new Agg(),
      code: shift.vehicleCode,
      name: shift.vehicleName,
      model: shift.vehicleModel,
      type: shift.vehicleType,
      owner: shift.owner,
    };
    truckMap.set(shift.vehicleId, truck);

    const operator = operatorMap.get(shift.driverId) ?? {
      agg: new Agg(),
      name: personName(shift.driverFirstName, shift.driverLastName, shift.driverName),
      crews: new Map<Crew, number>(),
    };
    operatorMap.set(shift.driverId, operator);

    if (crew) {
      operator.crews.set(crew, (operator.crews.get(crew) ?? 0) + 1);
      const counts = crewShiftTypes.get(crew) ?? { day: 0, night: 0 };
      counts[shiftType] += 1;
      crewShiftTypes.set(crew, counts);
    }

    const targets: Agg[] = [totals, dayAgg(date, shiftType), truck.agg, operator.agg];

    if (crew) targets.push(crewAgg(crew));

    for (const agg of targets) {
      agg.shifts += 1;
      agg.trucks.add(shift.vehicleId);
      agg.operators.add(shift.driverId);
      agg.trips += logs.length;
      agg.coalTrips += coalTrips;
      agg.soilTrips += soilTrips;
      agg.coalM3 += coalM3;
      agg.soilM3 += soilM3;
      agg.motoHours += motoHours;
      agg.km += km;
    }

    driverByVehicleSlot.set(`${shift.vehicleId}|${date}|${shiftType}`, shift.driverId);

    if (crew) {
      const key = `${crew}|${shift.driverId}`;
      const entry = crewOperators.get(key) ?? {
        crew,
        driverId: shift.driverId,
        name: operator.name,
        code: null,
        m3: 0,
        trips: 0,
        shifts: 0,
      };
      entry.m3 += coalM3 + soilM3;
      entry.trips += logs.length;
      entry.shifts += 1;
      crewOperators.set(key, entry);
    }

    if (shiftType === 'night') {
      addBest(nightOperators, shift.driverId, operator.name, null, coalM3 + soilM3, logs.length);
      addBest(nightTrucks, shift.vehicleId, shift.vehicleName, shift.vehicleMineNumber ?? shift.vehicleCode, coalM3 + soilM3, logs.length);
    }

    for (const log of logs) {
      const m3 = log.stockpileType === 'coal' ? coalPerTrip : log.stockpileType === 'soil' ? soilPerTrip : 0;

      if (log.excavatorId && shiftType === 'night') {
        addBest(nightExcavators, log.excavatorId, log.excavatorName ?? '—', log.excavatorCode, m3, 1);
      }

      if (log.excavatorId) {
        const exca = excavatorMap.get(log.excavatorId) ?? {
          code: log.excavatorCode,
          name: log.excavatorName ?? '—',
          trips: 0,
          coalM3: 0,
          soilM3: 0,
          trucks: new Set<string>(),
        };
        exca.trips += 1;
        if (log.stockpileType === 'coal') exca.coalM3 += m3;
        else if (log.stockpileType === 'soil') exca.soilM3 += m3;
        exca.trucks.add(shift.vehicleId);
        excavatorMap.set(log.excavatorId, exca);
      }

      const destKey = `${log.stockpileType ?? 'unknown'}|${log.stockpileLayer ?? ''}`;
      const dest = destinationMap.get(destKey) ?? {
        type: log.stockpileType ?? 'unknown',
        layer: log.stockpileLayer,
        trips: 0,
        m3: 0,
      };
      dest.trips += 1;
      dest.m3 += m3;
      destinationMap.set(destKey, dest);

      if (log.blockName) {
        const blockKey = `${log.blockName}|${log.blockLayer ?? ''}`;
        const block = blockMap.get(blockKey) ?? { name: log.blockName, layer: log.blockLayer, trips: 0, m3: 0 };
        block.trips += 1;
        block.m3 += m3;
        blockMap.set(blockKey, block);
      }
    }
  }

  // ── Түлш: цэнэглэлтийн өдөр/ээлжээс ээлжийг (бригад) тооцно ─
  let fleetFuel = 0;
  let unassignedFuel = 0;
  const fuelByCrew = new Map<Crew, number>();
  const fuelByVehicle = new Map<string, { liters: number; count: number }>();

  for (const refuel of refuelRows) {
    const liters = num(refuel.quantity);
    fleetFuel += liters;
    const byVehicle = fuelByVehicle.get(refuel.receiverVehicleId) ?? { liters: 0, count: 0 };
    byVehicle.liters += liters;
    byVehicle.count += 1;
    fuelByVehicle.set(refuel.receiverVehicleId, byVehicle);

    const shiftType = refuel.shiftType === 'day' || refuel.shiftType === 'night' ? refuel.shiftType : null;
    const crew = resolver.crewFor(refuel.operationalDate, shiftType);

    if (crew && shiftType) {
      fuelByCrew.set(crew, (fuelByCrew.get(crew) ?? 0) + liters);
      dayAgg(refuel.operationalDate, shiftType).fuelLiters += liters;
    } else {
      unassignedFuel += liters;
    }

    const truck = truckMap.get(refuel.receiverVehicleId);

    if (truck) {
      truck.agg.fuelLiters += liters;
    }

    // Операторт: тухайн өдөр/ээлжид техникийг жолоодсон оператор.
    if (shiftType) {
      const driverId = driverByVehicleSlot.get(`${refuel.receiverVehicleId}|${refuel.operationalDate}|${shiftType}`);
      const operator = driverId ? operatorMap.get(driverId) : undefined;

      if (operator) operator.agg.fuelLiters += liters;
    }
  }

  totals.fuelLiters = fleetFuel;

  for (const [crew, liters] of fuelByCrew) {
    crewAgg(crew).fuelLiters += liters;
  }

  // ── Төлөвлөгөө ──────────────────────────────────────────
  let planCoal = 0;
  let planSoil = 0;

  for (const plan of planRows) {
    const amount = num(plan.transportAmount);

    if (!plan.date || amount <= 0) continue;

    if (plan.isCoal) planCoal += amount;
    else planSoil += amount;

    const shiftType: ShiftType = plan.shiftType === 'night' ? 'night' : 'day';
    dayAgg(plan.date, shiftType).planM3 += amount;

    const crew = resolver.crewFor(plan.date, shiftType);
    if (crew) crewAgg(crew).planM3 += amount;
  }

  totals.planM3 = planCoal + planSoil;

  // ── Экскаваторын цаг, маркшейдер ────────────────────────
  const hoursByVehicle = new Map<
    string,
    { code: string | null; name: string; total: number; worked: number; repair: number; idle: number; logs: number }
  >();

  for (const row of equipmentRows) {
    const entry = hoursByVehicle.get(row.vehicleId) ?? {
      code: row.code,
      name: row.name,
      total: 0,
      worked: 0,
      repair: 0,
      idle: 0,
      logs: 0,
    };
    const total = num(row.totalHours);
    const repair = num(row.repairHours);
    const idle = num(row.idleHours);
    const worked = numOrNull(row.workedHours) ?? Math.max(0, total - repair - idle);

    entry.total += total;
    entry.worked += worked;
    entry.repair += repair;
    entry.idle += idle;
    entry.logs += 1;
    hoursByVehicle.set(row.vehicleId, entry);
  }

  const markByVehicle = new Map<string, number>();
  let markTotal = 0;

  for (const row of markRows) {
    const value = numOrNull(row.markProduction);

    if (value === null) continue;

    markTotal += value;
    markByVehicle.set(row.vehicleId, (markByVehicle.get(row.vehicleId) ?? 0) + value);
  }

  const excavatorIds = new Set([...excavatorMap.keys()]);

  // Рейсгүй ч цаг/маркшейдер бүртгэлтэй экскаваторыг харуулна (рейсийн бүртгэлтэй техникийн төрлөөс үл хамааран).
  for (const id of hoursByVehicle.keys()) {
    if (!truckMap.has(id)) excavatorIds.add(id);
  }

  for (const id of markByVehicle.keys()) {
    excavatorIds.add(id);
  }

  const excavatorsOut = [...excavatorIds]
    .map((id) => {
      const exca = excavatorMap.get(id);
      const hours = hoursByVehicle.get(id);
      const mark = markByVehicle.get(id) ?? null;
      const totalM3 = (exca?.coalM3 ?? 0) + (exca?.soilM3 ?? 0);

      return {
        vehicleId: id,
        code: exca?.code ?? hours?.code ?? null,
        name: exca?.name ?? hours?.name ?? '—',
        trips: exca?.trips ?? 0,
        trucks: exca?.trucks.size ?? 0,
        coalM3: round(exca?.coalM3 ?? 0),
        soilM3: round(exca?.soilM3 ?? 0),
        totalM3: round(totalM3),
        totalHours: hours ? round(hours.total) : null,
        workedHours: hours ? round(hours.worked) : null,
        repairHours: hours ? round(hours.repair) : null,
        idleHours: hours ? round(hours.idle) : null,
        /** Техникийн бэлэн байдал: (нийт − засвар) / нийт. */
        availability: hours ? percent(hours.total - hours.repair, hours.total) : null,
        /** Ашиглалт: ажилласан / нийт. */
        utilization: hours ? percent(hours.worked, hours.total) : null,
        m3PerHour: hours ? ratio(totalM3, hours.worked, 1) : null,
        markM3: mark === null ? null : round(mark),
        markDiff: mark === null ? null : round(mark - totalM3),
      };
    })
    .filter((e) => e.trips > 0 || e.totalHours !== null || e.markM3 !== null)
    .sort((a, b) => b.totalM3 - a.totalM3 || (a.code ?? '').localeCompare(b.code ?? ''));

  const excavatorHours = excavatorsOut.reduce(
    (acc, e) => {
      acc.total += e.totalHours ?? 0;
      acc.worked += e.workedHours ?? 0;
      acc.repair += e.repairHours ?? 0;
      return acc;
    },
    { total: 0, worked: 0, repair: 0 },
  );

  const totalResult = totals.result();

  // ── Онцлох: шөнийн ээлжийн шилдэг оператор, машин, экскаватор; хамгийн их түлш авсан техник ─
  const best = (map: Map<string, Best>) => {
    const top = [...map.entries()].sort((a, b) => b[1].m3 - a[1].m3 || b[1].trips - a[1].trips)[0];
    return top && (top[1].m3 > 0 || top[1].trips > 0)
      ? { id: top[0], name: top[1].name, code: top[1].code, m3: round(top[1].m3), trips: top[1].trips }
      : null;
  };
  const topFuelEntry = [...fuelByVehicle.entries()].sort((a, b) => b[1].liters - a[1].liters)[0];
  let topFuelVehicle: { id: string; name: string; code: string | null; liters: number; count: number } | null = null;

  if (topFuelEntry) {
    const [vehicle] = await drizzleDb
      .select({ name: vehicles.name, code: vehicles.code, mineNumber: vehicles.mineNumber })
      .from(vehicles)
      .where(eq(vehicles.id, topFuelEntry[0]))
      .limit(1);
    topFuelVehicle = {
      id: topFuelEntry[0],
      name: vehicle?.name ?? '—',
      code: vehicle?.mineNumber ?? vehicle?.code ?? null,
      liters: round(topFuelEntry[1].liters),
      count: topFuelEntry[1].count,
    };
  }

  const highlights = {
    nightOperator: best(nightOperators),
    nightTruck: best(nightTrucks),
    nightExcavator: best(nightExcavators),
    topFuelVehicle,
  };

  return {
    from,
    to,
    generatedAt: new Date().toISOString(),
    warnings,
    highlights,
    totals: {
      ...totalResult,
      excavators: excavatorMap.size,
      /** Бүх техникт олгосон түлш (экскаватор, туслах техник орно). */
      fleetFuelLiters: round(fleetFuel),
      /** Ээлжийн төрөлгүй тул бригадад хуваарилагдаагүй түлш. */
      unassignedFuelLiters: round(unassignedFuel),
      truckFuelLiters: round([...truckMap.values()].reduce((s, t) => s + t.agg.fuelLiters, 0)),
      planCoalM3: round(planCoal),
      planSoilM3: round(planSoil),
      markM3: markRows.length ? round(markTotal) : null,
      markDiff: markRows.length ? round(markTotal - totals.totalM3) : null,
      excavatorAvailability: percent(excavatorHours.total - excavatorHours.repair, excavatorHours.total),
      excavatorUtilization: percent(excavatorHours.worked, excavatorHours.total),
    },
    crews: CREWS.map((crew) => {
      const agg = crews.get(crew) ?? new Agg();
      const counts = crewShiftTypes.get(crew) ?? { day: 0, night: 0 };
      // Урамшуулал: тухайн ээлжийн хамгийн олон рейс хийсэн операторууд (тэнцвэл м³-ээр), эхний 3.
      const leaders = [...crewOperators.values()]
        .filter((o) => o.crew === crew && o.trips > 0)
        .sort((a, b) => b.trips - a.trips || b.m3 - a.m3)
        .slice(0, 3)
        .map((o, index) => ({
          rank: index + 1,
          driverId: o.driverId,
          name: o.name,
          trips: o.trips,
          m3: round(o.m3),
          shifts: o.shifts,
          tripsPerShift: ratio(o.trips, o.shifts, 1),
          /** Ээлжийн нийт рейсийн хэдэн хувийг хийсэн. */
          sharePercent: percent(o.trips, agg.trips),
        }));
      const top = leaders[0];

      return {
        crew,
        label: CREW_LABELS[crew],
        dayShifts: counts.day,
        nightShifts: counts.night,
        ...agg.result(),
        topOperator: top ? { driverId: top.driverId, name: top.name, m3: top.m3, trips: top.trips } : null,
        topOperators: leaders,
      };
    }),
    days: calendar.days.map(({ date, day, night }) => {
      const entry = dayMap.get(date);
      const dayResult = (entry?.day ?? new Agg()).result();
      const nightResult = (entry?.night ?? new Agg()).result();

      return {
        date,
        day: { crew: day, label: CREW_LABELS[day], ...dayResult },
        night: { crew: night, label: CREW_LABELS[night], ...nightResult },
        trips: dayResult.trips + nightResult.trips,
        coalM3: round(dayResult.coalM3 + nightResult.coalM3),
        soilM3: round(dayResult.soilM3 + nightResult.soilM3),
        totalM3: round(dayResult.totalM3 + nightResult.totalM3),
        fuelLiters: round(dayResult.fuelLiters + nightResult.fuelLiters),
        planM3: round(dayResult.planM3 + nightResult.planM3),
      };
    }),
    excavators: excavatorsOut,
    trucks: [...truckMap.entries()]
      .map(([vehicleId, t]) => ({
        vehicleId,
        code: t.code,
        name: t.name,
        model: t.model,
        type: t.type,
        owner: t.owner,
        ...t.agg.result(),
      }))
      .sort((a, b) => b.totalM3 - a.totalM3 || b.trips - a.trips),
    operators: [...operatorMap.entries()]
      .map(([driverId, o]) => {
        const mainCrew = [...o.crews.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        return {
          driverId,
          name: o.name,
          crew: mainCrew,
          crewLabel: mainCrew ? CREW_LABELS[mainCrew] : null,
          ...o.agg.result(),
        };
      })
      .sort((a, b) => b.totalM3 - a.totalM3 || b.trips - a.trips),
    destinations: [...destinationMap.values()]
      .map((d) => ({ ...d, m3: round(d.m3) }))
      .sort((a, b) => b.m3 - a.m3 || b.trips - a.trips),
    blocks: [...blockMap.values()]
      .map((b) => ({ ...b, m3: round(b.m3) }))
      .sort((a, b) => b.m3 - a.m3 || b.trips - a.trips),
    // Ээлжийн хуваарь (ижил ээлжтэй үргэлжилсэн хугацаанууд).
    schedule: calendar.segments.map((seg) => ({
      weekStart: seg.start,
      weekEnd: seg.end,
      day: seg.day,
      night: seg.night,
      resting: seg.resting,
      dayLabel: seg.dayLabel,
      nightLabel: seg.nightLabel,
      restingLabels: seg.restingLabels,
      source: seg.source,
    })),
  };
};

export type MiningReport = Awaited<ReturnType<typeof getMiningReport>>;
