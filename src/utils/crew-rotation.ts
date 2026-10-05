/**
 * Ээлжийн (бригад) хуваарь: А, Б, В, Г гэсэн 4 ээлж.
 *
 * - Ээлж 7 хоног тутам Мягмар гарагт солигдоно.
 * - Ээлж бүр 1 долоо хоног өдөр, дараагийн долоо хоног шөнө ажиллаад 2 долоо хоног амарна.
 * - Тиймээс шөнийн ээлж = өмнөх долоо хоногт өдөр ажилласан ээлж.
 *
 * Жишээ (ANCHOR_DATE = 2026-10-06, Мягмар):
 *   2026-09-29 – 10-05: өдөр Г, шөнө Б
 *   2026-10-06 – 10-12: өдөр В, шөнө Г
 *   2026-10-13 – 10-19: өдөр А, шөнө В
 *   2026-10-20 – 10-26: өдөр Б, шөнө А
 *   2026-10-27 – 11-02: өдөр Г, шөнө Б  (давтагдана)
 *
 * Ээлжийг ажлын өдөр (operational date) ба ээлжийн төрлөөр тодорхойлно. Шөнийн ээлжийн ажлын
 * өдөр нь эхэлсэн өдөр тул Мягмарын шөнө шинэ шөнийн ээлж ажиллана.
 *
 * DB-д A/B/C/D (enum_driver_shift_group) гэж хадгална: A=А, B=Б, C=В, D=Г.
 */

export const CREWS = ['A', 'B', 'C', 'D'] as const;
export type Crew = (typeof CREWS)[number];

export const CREW_LABELS: Record<Crew, string> = { A: 'А', B: 'Б', C: 'В', D: 'Г' };

/** Энэ өдрөөс эхлэх долоо хоногт өдөр В, шөнө Г ажиллана. Мягмар гараг байх ёстой. */
export const CREW_ANCHOR_DATE = '2026-10-06';

/** ANCHOR_DATE-ээс эхлэн долоо хоног бүрийн өдрийн ээлж (4 долоо хоногоор давтагдана). */
const DAY_ORDER: readonly Crew[] = ['C', 'A', 'B', 'D'];

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' огноог UTC өдрийн дугаар болгоно (цагийн бүсээс хамаарахгүй). */
const toDayNumber = (date: string): number | null => {
  const m = DATE_ONLY.exec(date.slice(0, 10));

  if (!m) return null;

  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  return Number.isNaN(ms) ? null : Math.floor(ms / DAY_MS);
};

const fromDayNumber = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

const mod = (n: number, m: number) => ((n % m) + m) % m;

const ANCHOR_DAY = toDayNumber(CREW_ANCHOR_DATE)!;

/** ANCHOR-оос хойшхи долоо хоногийн дугаар (өмнөх нь сөрөг). */
const weekIndex = (day: number) => Math.floor((day - ANCHOR_DAY) / 7);

export type CrewWeek = {
  /** Долоо хоногийн эхний өдөр (Мягмар). */
  weekStart: string;
  /** Долоо хоногийн сүүлийн өдөр (Даваа). */
  weekEnd: string;
  day: Crew;
  night: Crew;
  resting: Crew[];
};

const weekFor = (index: number): CrewWeek => {
  const day = DAY_ORDER[mod(index, 4)]!;
  const night = DAY_ORDER[mod(index - 1, 4)]!;
  const start = ANCHOR_DAY + index * 7;

  return {
    weekStart: fromDayNumber(start),
    weekEnd: fromDayNumber(start + 6),
    day,
    night,
    resting: CREWS.filter((c) => c !== day && c !== night),
  };
};

/** Тухайн ажлын өдрийн долоо хоногийн хуваарь. Огноо буруу бол null. */
export const crewWeekFor = (date: string | null | undefined): CrewWeek | null => {
  if (!date) return null;

  const day = toDayNumber(date);

  return day === null ? null : weekFor(weekIndex(day));
};

/** Ажлын өдөр ба ээлжийн төрлөөр ажиллах ээлж. Огноо/төрөл тодорхойгүй бол null. */
export const crewFor = (
  date: string | null | undefined,
  shiftType: string | null | undefined,
): Crew | null => {
  if (shiftType !== 'day' && shiftType !== 'night') return null;

  const week = crewWeekFor(date);

  if (!week) return null;

  return shiftType === 'day' ? week.day : week.night;
};

export const crewLabel = (crew: string | null | undefined) =>
  crew && crew in CREW_LABELS ? CREW_LABELS[crew as Crew] : null;

/** from–to хоорондох өдөр бүрийн өдрийн/шөнийн ээлж. */
export const crewCalendar = (from: string, to: string, maxDays = 400) => {
  const start = toDayNumber(from);
  const end = toDayNumber(to);

  if (start === null || end === null || end < start) return [];

  const days: { date: string; day: Crew; night: Crew }[] = [];

  for (let d = start; d <= end && days.length < maxDays; d += 1) {
    const week = weekFor(weekIndex(d));
    days.push({ date: fromDayNumber(d), day: week.day, night: week.night });
  }

  return days;
};

/** from-оос эхлэн count долоо хоногийн хуваарь. */
export const crewWeeks = (from: string, count: number) => {
  const start = toDayNumber(from);

  if (start === null) return [];

  const first = weekIndex(start);

  return Array.from({ length: Math.max(0, Math.min(count, 104)) }, (_, i) => weekFor(first + i));
};
