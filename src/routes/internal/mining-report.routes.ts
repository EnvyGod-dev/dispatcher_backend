import { getMiningReport } from '$/context/mining-report';
import { rbac } from '$/middlewares/rbac.middleware';
import type { AppEnv } from '$/utils/app-env';
import { CREW_ANCHOR_DATE, CREW_LABELS, crewFor, crewWeeks } from '$/utils/crew-rotation';
import { newDateInUb } from '$/utils/date-formatter';
import { Forbidden } from '$/utils/errors';
import { DATE_ONLY_PATTERN, resolveLegacyOperationalDate } from '$/utils/operational-date';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

/** Уулын ажлын тайлан харах эрх. */
const MINING_REPORT_ROLES = ['superadmin', 'admin', 'dispatcher', 'manager', 'ita', 'markscheider'] as const;

const dayShiftStartMinutes = 6 * 60 + 30;
const nightShiftStartMinutes = 18 * 60 + 30;

const miningReportRoutes = new Hono<AppEnv>()
  /**
   * Ээлжийн (А/Б/В/Г) хуваарь. Нэвтэрсэн бүх хэрэглэгч харна (оператор, түлшчин гэх мэт).
   */
  .get(
    '/crews/schedule',
    zValidator(
      'query',
      z.object({
        from: z.string().regex(DATE_ONLY_PATTERN).optional(),
        weeks: z.coerce.number().int().min(1).max(52).optional(),
      }),
    ),
    async (c) => {
      const { from, weeks } = c.req.valid('query');
      const now = newDateInUb();
      const minutes = now.hour() * 60 + now.minute();
      const shiftType = minutes >= dayShiftStartMinutes && minutes < nightShiftStartMinutes ? 'day' : 'night';
      const operationalDate = resolveLegacyOperationalDate({ shiftType, now });
      const crew = crewFor(operationalDate, shiftType);

      return c.json({
        anchorDate: CREW_ANCHOR_DATE,
        labels: CREW_LABELS,
        current: {
          operationalDate,
          shiftType,
          crew,
          label: crew ? CREW_LABELS[crew] : null,
          dayCrew: crewFor(operationalDate, 'day'),
          nightCrew: crewFor(operationalDate, 'night'),
        },
        weeks: crewWeeks(from ?? operationalDate, weeks ?? 8).map((w) => ({
          ...w,
          dayLabel: CREW_LABELS[w.day],
          nightLabel: CREW_LABELS[w.night],
          restingLabels: w.resting.map((r) => CREW_LABELS[r]),
        })),
      });
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
