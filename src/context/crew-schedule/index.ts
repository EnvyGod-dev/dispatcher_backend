import { drizzleDb } from '$/libs/database/db';
import { crewSchedulePeriods, shifts } from '$/libs/database/schema';
import {
  addDays,
  CREW_LABELS,
  CREWS,
  type Crew,
  crewFor as defaultCrewFor,
  fromDayNumber,
  toDayNumber,
} from '$/utils/crew-rotation';
import { ClientError, NotFound } from '$/utils/errors';
import { and, asc, eq, gte, lte, ne, sql } from 'drizzle-orm';

/**
 * Ээлжийн (А/Б/В/Г) хуваарь.
 *
 * Вебээс гараар оруулсан хугацаа (crew_schedule_periods) давуу эрхтэй. Тухайн өдөрт хуваарь
 * оруулаагүй бол utils/crew-rotation-ийн үндсэн дүрэм хэрэглэгдэнэ. Хэрэглэгчийн профайл дахь
 * ээлжийг (users.driver_shift_group) ашиглахгүй: тухайн өдөр ээлжинд гарсан техник тэр ээлжинд хамаарна.
 */

type Executor = typeof drizzleDb | Parameters<Parameters<typeof drizzleDb.transaction>[0]>[0];

export type CrewPeriod = typeof crewSchedulePeriods.$inferSelect;
export type CrewSource = 'manual' | 'default';

const MAX_PERIOD_DAYS = 366;
const MAX_RANGE_DAYS = 800;

let warnedMissingTable = false;

const assertDate = (value: string, label: string) => {
  if (toDayNumber(value) === null) {
    throw new ClientError(`${label} буруу байна.`);
  }
};

const daysBetween = (from: string, to: string) => toDayNumber(to)! - toDayNumber(from)!;

/**
 * Хугацаатай давхацсан хуваарийг уншина. Хүснэгт хараахан үүсээгүй (migration 0084 ажиллаагүй)
 * эсвэл уншихад алдаа гарвал хоосон буцааж үндсэн дүрмээр үргэлжилнэ.
 */
const loadPeriods = async (executor: Executor, organizationId: string, from: string, to: string) => {
  try {
    return await executor
      .select()
      .from(crewSchedulePeriods)
      .where(
        and(
          eq(crewSchedulePeriods.organizationId, organizationId),
          lte(crewSchedulePeriods.startDate, to),
          gte(crewSchedulePeriods.endDate, from),
        ),
      )
      .orderBy(asc(crewSchedulePeriods.startDate));
  } catch (error) {
    if (!warnedMissingTable) {
      warnedMissingTable = true;
      console.error('[crew-schedule] Хуваарь уншиж чадсангүй, үндсэн дүрмээр тооцно.', error);
    }

    return [] as CrewPeriod[];
  }
};

export type CrewResolver = {
  crewFor: (date: string | null | undefined, shiftType: string | null | undefined) => Crew | null;
  slot: (date: string) => { day: Crew; night: Crew; source: CrewSource; periodId: string | null } | null;
};

const buildResolver = (periods: CrewPeriod[]): CrewResolver => {
  const find = (date: string) => periods.find((p) => p.startDate <= date && p.endDate >= date) ?? null;

  const slot: CrewResolver['slot'] = (date) => {
    const d = date?.slice(0, 10);

    if (!d || toDayNumber(d) === null) return null;

    const period = find(d);

    if (period) {
      return { day: period.dayCrew, night: period.nightCrew, source: 'manual', periodId: period.id };
    }

    const day = defaultCrewFor(d, 'day');
    const night = defaultCrewFor(d, 'night');

    return day && night ? { day, night, source: 'default', periodId: null } : null;
  };

  return {
    slot,
    crewFor: (date, shiftType) => {
      if (!date || (shiftType !== 'day' && shiftType !== 'night')) return null;

      const s = slot(date);

      return s ? (shiftType === 'day' ? s.day : s.night) : null;
    },
  };
};

/** from–to хугацааны ээлжийг тооцох функц (тайлан, жагсаалтад нэг удаа ачаална). */
export const getCrewResolver = async (organizationId: string, from: string, to: string, executor: Executor = drizzleDb) =>
  buildResolver(await loadPeriods(executor, organizationId, from, to));

/** Нэг ээлжийн бригадыг тодорхойлно (ээлж эхлэх үед). */
export const resolveCrew = async (
  organizationId: string,
  date: string | null | undefined,
  shiftType: string | null | undefined,
  executor: Executor = drizzleDb,
) => {
  if (!date || toDayNumber(date) === null) return null;

  const d = date.slice(0, 10);

  return (await getCrewResolver(organizationId, d, d, executor)).crewFor(d, shiftType);
};

/** Өдөр бүрийн өдөр/шөнийн ээлж ба ижил ээлжтэй үргэлжилсэн хугацаанууд (харуулахад). */
export const getCrewCalendar = async (organizationId: string, from: string, to: string) => {
  assertDate(from, 'Эхлэх огноо');
  assertDate(to, 'Дуусах огноо');

  if (daysBetween(from, to) < 0) throw new ClientError('Эхлэх огноо дуусах огнооноос хойш байна.');
  if (daysBetween(from, to) > MAX_RANGE_DAYS) throw new ClientError(`Хугацаа ${MAX_RANGE_DAYS} хоногоос ихгүй байна.`);

  const resolver = await getCrewResolver(organizationId, from, to);
  const start = toDayNumber(from)!;
  const end = toDayNumber(to)!;
  const days: { date: string; day: Crew; night: Crew; source: CrewSource }[] = [];

  for (let n = start; n <= end; n += 1) {
    const date = fromDayNumber(n);
    const s = resolver.slot(date);

    if (s) days.push({ date, day: s.day, night: s.night, source: s.source });
  }

  const segments: {
    start: string;
    end: string;
    day: Crew;
    night: Crew;
    resting: Crew[];
    source: CrewSource;
    dayLabel: string;
    nightLabel: string;
    restingLabels: string[];
  }[] = [];

  for (const d of days) {
    const last = segments[segments.length - 1];

    // Үндсэн дүрмийн хугацааг Мягмар бүрээр (долоо хоногоор) хуваана.
    const isTuesday = new Date(`${d.date}T00:00:00Z`).getUTCDay() === 2;
    const continues =
      last &&
      last.day === d.day &&
      last.night === d.night &&
      last.source === d.source &&
      addDays(last.end, 1) === d.date &&
      !(d.source === 'default' && isTuesday);

    if (continues) {
      last.end = d.date;
    } else {
      const resting = CREWS.filter((c) => c !== d.day && c !== d.night);
      segments.push({
        start: d.date,
        end: d.date,
        day: d.day,
        night: d.night,
        resting,
        source: d.source,
        dayLabel: CREW_LABELS[d.day],
        nightLabel: CREW_LABELS[d.night],
        restingLabels: resting.map((c) => CREW_LABELS[c]),
      });
    }
  }

  return { days, segments };
};

export const listCrewPeriods = async (organizationId: string, from?: string, to?: string) => {
  return drizzleDb
    .select()
    .from(crewSchedulePeriods)
    .where(
      and(
        eq(crewSchedulePeriods.organizationId, organizationId),
        to ? lte(crewSchedulePeriods.startDate, to) : undefined,
        from ? gte(crewSchedulePeriods.endDate, from) : undefined,
      ),
    )
    .orderBy(asc(crewSchedulePeriods.startDate));
};

/**
 * Хуваарь өөрчлөгдсөн хугацааны ээлжүүдийн хадгалсан бригадыг (shifts.driver_shift_group) шинэчилнэ.
 */
export const resyncShiftCrews = async (executor: Executor, organizationId: string, from: string, to: string) => {
  const start = toDayNumber(from);
  const end = toDayNumber(to);

  if (start === null || end === null || end < start) return;

  const resolver = await getCrewResolver(organizationId, from, to, executor);
  const rows: { date: string; type: 'day' | 'night'; crew: Crew }[] = [];

  for (let n = start; n <= end && n - start <= MAX_RANGE_DAYS; n += 1) {
    const date = fromDayNumber(n);
    const s = resolver.slot(date);

    if (!s) continue;

    rows.push({ date, type: 'day', crew: s.day }, { date, type: 'night', crew: s.night });
  }

  if (rows.length === 0) return;

  const values = sql.join(
    rows.map((r) => sql`(${r.date}::date, ${r.type}::text, ${r.crew}::text)`),
    sql`, `,
  );

  await executor.execute(sql`
    UPDATE ${shifts} AS s
    SET driver_shift_group = v.crew::enum_driver_shift_group
    FROM (VALUES ${values}) AS v(op_date, shift_type, crew)
    WHERE s.organization_id = ${organizationId}
      AND s.operational_date = v.op_date
      AND s.shift_type::text = v.shift_type
      AND s.driver_shift_group IS DISTINCT FROM v.crew::enum_driver_shift_group
  `);
};

export type CrewPeriodInput = {
  startDate: string;
  endDate: string;
  dayCrew: Crew;
  nightCrew: Crew;
  notes?: string | null;
};

const validatePeriod = (input: CrewPeriodInput) => {
  assertDate(input.startDate, 'Эхлэх огноо');
  assertDate(input.endDate, 'Дуусах огноо');

  const length = daysBetween(input.startDate, input.endDate);

  if (length < 0) throw new ClientError('Эхлэх огноо дуусах огнооноос хойш байна.');
  if (length >= MAX_PERIOD_DAYS) throw new ClientError(`Нэг хугацаа ${MAX_PERIOD_DAYS} хоногоос ихгүй байна.`);
  if (input.dayCrew === input.nightCrew) throw new ClientError('Өдрийн ба шөнийн ээлж өөр байх ёстой.');
};

const lockOrganization = (executor: Executor, organizationId: string) =>
  executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`crew-schedule:${organizationId}`}))`);

const findOverlaps = (executor: Executor, organizationId: string, from: string, to: string, excludeId?: string) =>
  executor
    .select()
    .from(crewSchedulePeriods)
    .where(
      and(
        eq(crewSchedulePeriods.organizationId, organizationId),
        lte(crewSchedulePeriods.startDate, to),
        gte(crewSchedulePeriods.endDate, from),
        excludeId ? ne(crewSchedulePeriods.id, excludeId) : undefined,
      ),
    )
    .orderBy(asc(crewSchedulePeriods.startDate));

const overlapError = (periods: CrewPeriod[]) =>
  new ClientError(
    `Энэ хугацаанд хуваарь оруулсан байна: ${periods
      .slice(0, 3)
      .map((p) => `${p.startDate} – ${p.endDate}`)
      .join(', ')}. Эхлээд засах эсвэл устгана уу.`,
  );

export const createCrewPeriod = async (organizationId: string, userId: string, input: CrewPeriodInput) => {
  validatePeriod(input);

  return drizzleDb.transaction(async (tx) => {
    await lockOrganization(tx, organizationId);

    const overlaps = await findOverlaps(tx, organizationId, input.startDate, input.endDate);

    if (overlaps.length > 0) throw overlapError(overlaps);

    const [period] = await tx
      .insert(crewSchedulePeriods)
      .values({ ...input, notes: input.notes ?? null, organizationId, createdBy: userId })
      .returning();

    await resyncShiftCrews(tx, organizationId, input.startDate, input.endDate);

    return period!;
  });
};

export const updateCrewPeriod = async (organizationId: string, id: string, input: CrewPeriodInput) => {
  validatePeriod(input);

  return drizzleDb.transaction(async (tx) => {
    await lockOrganization(tx, organizationId);

    const [existing] = await tx
      .select()
      .from(crewSchedulePeriods)
      .where(and(eq(crewSchedulePeriods.id, id), eq(crewSchedulePeriods.organizationId, organizationId)));

    if (!existing) throw new NotFound('Хуваарь олдсонгүй.');

    const overlaps = await findOverlaps(tx, organizationId, input.startDate, input.endDate, id);

    if (overlaps.length > 0) throw overlapError(overlaps);

    const [period] = await tx
      .update(crewSchedulePeriods)
      .set({ ...input, notes: input.notes ?? null, updatedAt: new Date().toISOString() })
      .where(eq(crewSchedulePeriods.id, id))
      .returning();

    await resyncShiftCrews(tx, organizationId, existing.startDate, existing.endDate);
    await resyncShiftCrews(tx, organizationId, input.startDate, input.endDate);

    return period!;
  });
};

export const deleteCrewPeriod = async (organizationId: string, id: string) => {
  return drizzleDb.transaction(async (tx) => {
    await lockOrganization(tx, organizationId);

    const [existing] = await tx
      .delete(crewSchedulePeriods)
      .where(and(eq(crewSchedulePeriods.id, id), eq(crewSchedulePeriods.organizationId, organizationId)))
      .returning();

    if (!existing) throw new NotFound('Хуваарь олдсонгүй.');

    await resyncShiftCrews(tx, organizationId, existing.startDate, existing.endDate);

    return existing;
  });
};

/**
 * Долоо хоног тутам солигдох хуваарийг автоматаар үүсгэнэ.
 * dayOrder: долоо хоног бүрийн өдрийн ээлжийн дараалал (4 ээлж). Шөнө = өмнөх долоо хоногийн өдөр.
 * replace=true бол тухайн хугацаатай давхацсан хуваарийг тайрч/устгаад шинээр бичнэ.
 */
export const generateCrewPeriods = async (
  organizationId: string,
  userId: string,
  input: { startDate: string; weeks: number; dayOrder: Crew[]; replace: boolean },
) => {
  assertDate(input.startDate, 'Эхлэх огноо');

  if (!Number.isInteger(input.weeks) || input.weeks < 1 || input.weeks > 104) {
    throw new ClientError('Долоо хоногийн тоо 1–104 байна.');
  }

  if (input.dayOrder.length !== 4 || new Set(input.dayOrder).size !== 4) {
    throw new ClientError('Өдрийн ээлжийн дараалалд 4 ээлжийг давхардуулахгүй оруулна уу.');
  }

  const rangeStart = input.startDate;
  const rangeEnd = addDays(input.startDate, input.weeks * 7 - 1)!;
  const order = input.dayOrder;

  const rows = Array.from({ length: input.weeks }, (_, i) => ({
    organizationId,
    createdBy: userId,
    startDate: addDays(rangeStart, i * 7)!,
    endDate: addDays(rangeStart, i * 7 + 6)!,
    dayCrew: order[i % 4]!,
    nightCrew: order[(i + 3) % 4]!,
    notes: null,
  }));

  return drizzleDb.transaction(async (tx) => {
    await lockOrganization(tx, organizationId);

    const overlaps = await findOverlaps(tx, organizationId, rangeStart, rangeEnd);

    if (overlaps.length > 0 && !input.replace) throw overlapError(overlaps);

    for (const p of overlaps) {
      const before = p.startDate < rangeStart ? { startDate: p.startDate, endDate: addDays(rangeStart, -1)! } : null;
      const after = p.endDate > rangeEnd ? { startDate: addDays(rangeEnd, 1)!, endDate: p.endDate } : null;

      if (before) {
        await tx
          .update(crewSchedulePeriods)
          .set({ ...before, updatedAt: new Date().toISOString() })
          .where(eq(crewSchedulePeriods.id, p.id));
      } else if (after) {
        await tx
          .update(crewSchedulePeriods)
          .set({ ...after, updatedAt: new Date().toISOString() })
          .where(eq(crewSchedulePeriods.id, p.id));
      } else {
        await tx.delete(crewSchedulePeriods).where(eq(crewSchedulePeriods.id, p.id));
      }

      // Хоёр талаараа хальсан хугацааг хуваана (өмнөх хэсгийг дээр шинэчилсэн).
      if (before && after) {
        await tx.insert(crewSchedulePeriods).values({
          organizationId,
          createdBy: p.createdBy,
          startDate: after.startDate,
          endDate: after.endDate,
          dayCrew: p.dayCrew,
          nightCrew: p.nightCrew,
          notes: p.notes,
        });
      }
    }

    const created = await tx.insert(crewSchedulePeriods).values(rows).returning();

    await resyncShiftCrews(tx, organizationId, rangeStart, rangeEnd);

    return created;
  });
};
