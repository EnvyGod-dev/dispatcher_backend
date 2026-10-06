import { getMiningReport } from '$/context/mining-report';
import { rbac } from '$/middlewares/rbac.middleware';
import type { AppEnv } from '$/utils/app-env';
import {
  createCrewPeriod,
  deleteCrewPeriod,
  generateCrewPeriods,
  getCrewCalendar,
  getCrewResolver,
  listCrewPeriods,
  updateCrewPeriod,
} from '$/context/crew-schedule';
import { addDays, CREW_ANCHOR_DATE, CREW_LABELS, CREWS } from '$/utils/crew-rotation';
import { newDateInUb } from '$/utils/date-formatter';
import { Forbidden } from '$/utils/errors';
import { DATE_ONLY_PATTERN, resolveLegacyOperationalDate } from '$/utils/operational-date';
import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import { z } from 'zod';

/** Уулын ажлын тайлан харах эрх. */
const MINING_REPORT_ROLES = ['superadmin', 'admin', 'dispatcher', 'manager', 'ita', 'markscheider'] as const;

/** Ээлжийн хуваарь засах эрх. */
const CREW_MANAGE_ROLES = ['superadmin', 'admin', 'dispatcher', 'manager'] as const;

const crewEnum = z.enum(CREWS);

const periodSchema = z
  .object({
    startDate: z.string().regex(DATE_ONLY_PATTERN),
    endDate: z.string().regex(DATE_ONLY_PATTERN),
    dayCrew: crewEnum,
    nightCrew: crewEnum,
    notes: z.string().trim().max(500).nullish(),
  })
  .refine((v) => v.dayCrew !== v.nightCrew, { message: 'Өдрийн ба шөнийн ээлж өөр байх ёстой.', path: ['nightCrew'] });

const orgId = (c: Context<AppEnv>) => {
  const organizationId = c.get('currentUser').organizationId;

  if (!organizationId) {
    throw new Forbidden();
  }

  return organizationId;
};

const dayShiftStartMinutes = 6 * 60 + 30;
const nightShiftStartMinutes = 18 * 60 + 30;

const miningReportRoutes = new Hono<AppEnv>()
  /**
   * Ээлжийн (А/Б/В/Г) хуваарь: одоогийн ээлж ба цаашдын хугацаанууд. Нэвтэрсэн бүх хэрэглэгч харна.
   */
  .get(
    '/crews/schedule',
    zValidator(
      'query',
      z.object({
        from: z.string().regex(DATE_ONLY_PATTERN).optional(),
        weeks: z.coerce.number().int().min(1).max(52).optional(),
        days: z.coerce.number().int().min(1).max(400).optional(),
      }),
    ),
    async (c) => {
      const { from, weeks, days } = c.req.valid('query');
      const organizationId = orgId(c);
      const now = newDateInUb();
      const minutes = now.hour() * 60 + now.minute();
      const shiftType = minutes >= dayShiftStartMinutes && minutes < nightShiftStartMinutes ? 'day' : 'night';
      const operationalDate = resolveLegacyOperationalDate({ shiftType, now });
      const start = from ?? operationalDate;
      const end = addDays(start, (days ?? (weeks ?? 8) * 7) - 1)!;
      const [calendar, resolver] = await Promise.all([
        getCrewCalendar(organizationId, start, end),
        getCrewResolver(organizationId, operationalDate, operationalDate),
      ]);
      const slot = resolver.slot(operationalDate);
      const crew = resolver.crewFor(operationalDate, shiftType);

      return c.json({
        anchorDate: CREW_ANCHOR_DATE,
        labels: CREW_LABELS,
        current: {
          operationalDate,
          shiftType,
          crew,
          label: crew ? CREW_LABELS[crew] : null,
          dayCrew: slot?.day ?? null,
          nightCrew: slot?.night ?? null,
          source: slot?.source ?? null,
        },
        days: calendar.days,
        segments: calendar.segments,
        // Хуучин клиентэд зориулсан хэлбэр.
        weeks: calendar.segments.map((seg) => ({
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
      });
    },
  )

  /** Вебээс гараар оруулсан хуваарийн жагсаалт. */
  .get(
    '/crews/periods',
    zValidator(
      'query',
      z.object({
        from: z.string().regex(DATE_ONLY_PATTERN).optional(),
        to: z.string().regex(DATE_ONLY_PATTERN).optional(),
      }),
    ),
    async (c) => {
      const { from, to } = c.req.valid('query');

      return c.json(await listCrewPeriods(orgId(c), from, to));
    },
  )
  .post('/crews/periods', rbac({ roles: [...CREW_MANAGE_ROLES] }), zValidator('json', periodSchema), async (c) => {
    return c.json(await createCrewPeriod(orgId(c), c.get('currentUser').id, c.req.valid('json')));
  })
  .put(
    '/crews/periods/:id',
    rbac({ roles: [...CREW_MANAGE_ROLES] }),
    zValidator('param', z.object({ id: z.string().uuid() })),
    zValidator('json', periodSchema),
    async (c) => {
      return c.json(await updateCrewPeriod(orgId(c), c.req.valid('param').id, c.req.valid('json')));
    },
  )
  .delete(
    '/crews/periods/:id',
    rbac({ roles: [...CREW_MANAGE_ROLES] }),
    zValidator('param', z.object({ id: z.string().uuid() })),
    async (c) => {
      return c.json(await deleteCrewPeriod(orgId(c), c.req.valid('param').id));
    },
  )
  /** Долоо хоног тутам солигдох хуваарийг автоматаар үүсгэнэ. */
  .post(
    '/crews/periods/generate',
    rbac({ roles: [...CREW_MANAGE_ROLES] }),
    zValidator(
      'json',
      z.object({
        startDate: z.string().regex(DATE_ONLY_PATTERN),
        weeks: z.number().int().min(1).max(104),
        dayOrder: z.array(crewEnum).length(4),
        replace: z.boolean().default(true),
      }),
    ),
    async (c) => {
      return c.json(await generateCrewPeriods(orgId(c), c.get('currentUser').id, c.req.valid('json')));
    },
  )

  .get(
    '/mining-report',
    rbac({ roles: [...MINING_REPORT_ROLES] }),
    zValidator(
      'query',
      z.object({
        from: z.string().regex(DATE_ONLY_PATTERN),
        to: z.string().regex(DATE_ONLY_PATTERN),
      }),
    ),
    async (c) => {
      const { from, to } = c.req.valid('query');
      const currentUser = c.get('currentUser');

      if (!currentUser.organizationId) {
        throw new Forbidden();
      }

      return c.json(await getMiningReport({ organizationId: currentUser.organizationId, from, to }));
    },
  );

export default miningReportRoutes;
