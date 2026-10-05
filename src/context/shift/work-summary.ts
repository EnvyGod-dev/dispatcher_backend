import { drizzleDb } from '$/libs/database/db';
import { fuelRefuelings, fuelTanks, shifts } from '$/libs/database/schema';
import { ClientError } from '$/utils/errors';
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';

type ShiftRef = { id: string; vehicleId: string; operationalDate: string | null; shiftType: string | null };

export type ShiftFuel = {
  liters: number;
  items: { id: string; refueledAt: string; liters: number; source: string | null; shiftType: string | null }[];
};

const num = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value: number, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/**
 * Ээлж бүрт тухайн техник тэр ажлын өдөр (ээлж таарвал) хэдэн литр түлш авсныг тооцно.
 * Цэнэглэлт ээлжийн төрөлгүй бол тухайн өдрийн эхний ээлжид хамаатуулна.
 */
export const getFuelByShift = async (organizationId: string, refs: ShiftRef[]) => {
  const result = new Map<string, ShiftFuel>();
  const withDate = refs.filter((r) => r.operationalDate);

  if (withDate.length === 0) {
    return result;
  }

  const vehicleIds = [...new Set(withDate.map((r) => r.vehicleId))];
  const dates = withDate.map((r) => r.operationalDate!).sort();

  const rows = await drizzleDb
    .select({
      id: fuelRefuelings.id,
      receiverVehicleId: fuelRefuelings.receiverVehicleId,
      operationalDate: fuelRefuelings.operationalDate,
      shiftType: fuelRefuelings.shiftType,
      refueledAt: fuelRefuelings.refueledAt,
      quantity: fuelRefuelings.quantity,
      sourceType: fuelRefuelings.sourceType,
      tankName: fuelTanks.name,
      dispenserMineNumber: sql<string | null>`(SELECT d.mine_number FROM vehicles d WHERE d.id = ${fuelRefuelings.dispenserVehicleId})`,
    })
    .from(fuelRefuelings)
    .leftJoin(fuelTanks, eq(fuelTanks.id, fuelRefuelings.tankId))
    .where(
      and(
        eq(fuelRefuelings.organizationId, organizationId),
        isNull(fuelRefuelings.cancelledAt),
        inArray(fuelRefuelings.receiverVehicleId, vehicleIds),
        gte(fuelRefuelings.operationalDate, dates[0]!),
        lte(fuelRefuelings.operationalDate, dates[dates.length - 1]!),
      ),
    )
    .orderBy(asc(fuelRefuelings.refueledAt));

  for (const row of rows) {
    const candidates = withDate.filter(
      (r) => r.vehicleId === row.receiverVehicleId && r.operationalDate === row.operationalDate,
    );

    if (candidates.length === 0) continue;

    const target = (row.shiftType && candidates.find((c) => c.shiftType === row.shiftType)) || (row.shiftType ? null : candidates[0]);

    if (!target) continue;

    const liters = num(row.quantity) ?? 0;
    const entry = result.get(target.id) ?? { liters: 0, items: [] };

    entry.liters = round(entry.liters + liters);
    entry.items.push({
      id: row.id,
      refueledAt: row.refueledAt,
      liters,
      source: row.sourceType === 'tank' ? row.tankName : row.dispenserMineNumber,
      shiftType: row.shiftType,
    });
    result.set(target.id, entry);
  }

  return result;
};

const MAX_DAYS = 93;

/**
 * Операторын өөрийн ажлын нэгдсэн тайлан: сонгосон хугацааны нийт дүн, өдөр → ээлж → рейс задаргаа.
 */
export const getDriverWorkSummary = async (input: {
  driverId: string;
  organizationId: string;
  from: string;
  to: string;
}) => {
  const days = (new Date(input.to).getTime() - new Date(input.from).getTime()) / 86_400_000;

  if (Number.isNaN(days) || days < 0) {
    throw new ClientError('Эхлэх огноо дуусах огнооноос хойш байна.');
  }

  if (days > MAX_DAYS) {
    throw new ClientError(`Хугацаа ${MAX_DAYS} хоногоос ихгүй байна.`);
  }

  const shiftRows = await drizzleDb.query.shifts.findMany({
    with: {
      vehicle: true,
      workLogs: {
        with: {
          stockpile: true,
          dailyPlan: {
            with: {
              vehicle: true,
              miningBlock: true,
            },
          },
        },
      },
    },
    where: and(
      eq(shifts.driverId, input.driverId),
      eq(shifts.organizationId, input.organizationId),
      gte(shifts.operationalDate, input.from),
      lte(shifts.operationalDate, input.to),
    ),
    orderBy: [asc(shifts.operationalDate), asc(shifts.shiftStart)],
  });

  const fuel = await getFuelByShift(input.organizationId, shiftRows);

  const totals = {
    shifts: 0,
    trips: 0,
    coalTrips: 0,
    soilTrips: 0,
    coalM3: 0,
    soilM3: 0,
    motoHours: 0,
    km: 0,
    fuelLiters: 0,
  };

  type DayAgg = typeof totals & { date: string; shiftsList: unknown[] };
  const dayMap = new Map<string, DayAgg>();

  for (const shift of shiftRows) {
    const date = shift.operationalDate ?? shift.shiftStart?.slice(0, 10) ?? '';
    const trips = shift.workLogs
      .filter((log) => log.status !== 'cancelled')
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
    const coalTrips = trips.filter((log) => log.stockpile?.type === 'coal').length;
    const soilTrips = trips.filter((log) => log.stockpile?.type === 'soil').length;
    const motoStart = num(shift.motoStart);
    const motoEnd = num(shift.motoEnd);
    const kmStart = num(shift.mileageStart);
    const kmEnd = num(shift.mileageEnd);
    const motoHours = motoStart !== null && motoEnd !== null && motoEnd >= motoStart ? round(motoEnd - motoStart) : 0;
    const km = kmStart !== null && kmEnd !== null && kmEnd >= kmStart ? round(kmEnd - kmStart) : 0;
    const shiftFuel = fuel.get(shift.id);
    const coalM3 = num(shift.coalProduct) ?? 0;
    const soilM3 = num(shift.soilProduct) ?? 0;

    const shiftSummary = {
      id: shift.id,
      shiftType: shift.shiftType,
      status: shift.status,
      shiftStart: shift.shiftStart,
      shiftEnd: shift.shiftEnd,
      vehicleCode: shift.vehicle?.code ?? null,
      vehicleNumber: shift.vehicle?.vehicleNumber ?? null,
      vehicleType: shift.vehicle?.type ?? null,
      motoStart: shift.motoStart,
      motoEnd: shift.motoEnd,
      mileageStart: shift.mileageStart,
      mileageEnd: shift.mileageEnd,
      motoHours,
      km,
      tripCount: trips.length,
      coalTrips,
      soilTrips,
      coalM3,
      soilM3,
      fuelLiters: shiftFuel?.liters ?? 0,
      refuelings: shiftFuel?.items ?? [],
      trips: trips.map((log) => ({
        id: log.id,
        startTime: log.startTime,
        endTime: log.endTime,
        status: log.status,
        excavatorCode: log.dailyPlan?.vehicle?.code ?? null,
        excavatorNumber: log.dailyPlan?.vehicle?.vehicleNumber ?? null,
        blockName: log.dailyPlan?.miningBlock?.name ?? null,
        blockLayer: log.dailyPlan?.miningBlock?.layerNumber ?? null,
        stockpileType: log.stockpile?.type ?? null,
        stockpileLayer: log.stockpile?.layerNumber ?? null,
        notes: log.notes,
      })),
    };

    const day = dayMap.get(date) ?? {
      date,
      shifts: 0,
      trips: 0,
      coalTrips: 0,
      soilTrips: 0,
      coalM3: 0,
      soilM3: 0,
      motoHours: 0,
      km: 0,
      fuelLiters: 0,
      shiftsList: [],
    };

    for (const target of [day, totals]) {
      target.shifts += 1;
      target.trips += trips.length;
      target.coalTrips += coalTrips;
      target.soilTrips += soilTrips;
      target.coalM3 = round(target.coalM3 + coalM3, 2);
      target.soilM3 = round(target.soilM3 + soilM3, 2);
      target.motoHours = round(target.motoHours + motoHours);
      target.km = round(target.km + km);
      target.fuelLiters = round(target.fuelLiters + (shiftFuel?.liters ?? 0));
    }

    day.shiftsList.push(shiftSummary);
    dayMap.set(date, day);
  }

  return {
    from: input.from,
    to: input.to,
    totals,
    days: [...dayMap.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(({ shiftsList, ...rest }) => ({ ...rest, shifts: shiftsList.length, shiftList: shiftsList })),
  };
};

