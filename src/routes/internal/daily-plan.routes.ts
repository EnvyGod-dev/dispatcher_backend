import {
  createDailyPlan,
  type DailyPlanStatus,
  deleteDailyPlan,
  getActiveDailyPlanConflict,
  getDailyPlanByDateType,
  getDailyPlanById,
  getDailyPlans,
  getRouteIdForStockpiles,
  updateDailyPlan,
} from '$/context/daily-plan';
import { drizzleDb } from '$/libs/database/db';
import {
  enumDailyPlanStatus,
  enumShiftType,
  workLogs,
} from '$/libs/database/schema';
import { rbac } from '$/middlewares/rbac.middleware';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { createDate, newDateInUb } from '$/utils/date-formatter';
import { DATE_ONLY_PATTERN } from '$/utils/operational-date';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { ShiftType } from '$/context/shift/types';

const dayShiftStartMinutes = 6 * 60 + 30;
const nightShiftStartMinutes = 18 * 60 + 30;
const getMinutesInDay = (date: ReturnType<typeof newDateInUb>) => {
  return date.hour() * 60 + date.minute();
};

const getCurrentShiftPlanFilter = (date = newDateInUb()) => {
  const minutes = getMinutesInDay(date);

  if (minutes >= dayShiftStartMinutes && minutes < nightShiftStartMinutes) {
    return {
      shiftType: 'day' as const,
      date: date.format('YYYY-MM-DD'),
    };
  }

  return {
    shiftType: 'night' as const,
    date:
      minutes < dayShiftStartMinutes
        ? date.subtract(1, 'day').format('YYYY-MM-DD')
        : date.format('YYYY-MM-DD'),
  };
};

const resolveDailyPlansFilter = ({
  date,
  shiftType,
}: {
  date?: string;
  shiftType?: ShiftType;
}) => {
  if (!date) {
    const currentShift = getCurrentShiftPlanFilter();

    if (!shiftType) {
      return currentShift;
    }

    return {
      shiftType,
      date:
        shiftType === 'night'
          ? currentShift.date
          : newDateInUb().format('YYYY-MM-DD'),
    };
  }

  if (DATE_ONLY_PATTERN.test(date)) {
    return {
      shiftType,
      date,
    };
  }

  const requestedDateInUb = createDate(date);

  if (!shiftType) {
    return getCurrentShiftPlanFilter(requestedDateInUb);
  }

  if (shiftType === 'night') {
    const minutes = getMinutesInDay(requestedDateInUb);

    return {
      shiftType,
      date:
        minutes < dayShiftStartMinutes
          ? requestedDateInUb.subtract(1, 'day').format('YYYY-MM-DD')
          : requestedDateInUb.format('YYYY-MM-DD'),
    };
  }

  return {
    shiftType,
    date: requestedDateInUb.format('YYYY-MM-DD'),
  };
};

const dailyPlanRoutes = new Hono<AppEnv>()
  .get(
    '/daily-plan',
    zValidator(
      'query',
      z.object({
        date: z.string(),
        shiftType: z.enum(enumShiftType.enumValues),
      })
    ),
    async (c) => {
      const { date, shiftType } = c.req.valid('query');

      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const plan = await getDailyPlanByDateType({
        date,
        shiftType,
        organizationId: user.organizationId,
      });

      if (plan === null) {
        throw new HTTPException(422, {
          message: 'Plan not found',
        });
      }

      return c.json(plan);
    }
  )
  /**
   * Вебийн өдрийн төлөвлөлтийн жагсаалт: эхлэх–дуусах огноогоор.
   * Mobile-ийн `/daily-plans`, `/v2/daily-plans`-д нөлөөлөхгүйн тулд тусдаа.
   */
  .get(
    '/daily-plans/range',
    rbac({ roles: ['dispatcher', 'admin', 'markscheider', 'ita'] }),
    zValidator(
      'query',
      z
        .object({
          limit: z.coerce.number().min(1).max(500).default(25),
          offset: z.coerce.number().min(0).default(0),
          shiftType: z.enum(enumShiftType.enumValues).optional(),
          status: z.enum(enumDailyPlanStatus.enumValues).optional(),
          startDate: z.string().regex(DATE_ONLY_PATTERN),
          endDate: z.string().regex(DATE_ONLY_PATTERN),
        })
        .refine((v) => v.startDate <= v.endDate, {
          message: 'Эхлэх огноо дуусах огнооноос хойш байна.',
          path: ['endDate'],
        })
    ),
    async (c) => {
      const { limit, offset, startDate, endDate, shiftType, status } =
        c.req.valid('query');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const data = await getDailyPlans(
        { limit, offset },
        {
          organizationId: user.organizationId,
          startDate,
          endDate,
          shiftType,
          status,
        }
      );

      return c.json(data, {
        headers: {
          'X-Total-Count': data[0]?.totalCount.toString() ?? '0',
        },
      });
    }
  )
  .get(
    '/v2/daily-plans',
    rbac({ roles: ['dispatcher', 'admin', 'driver', 'markscheider', 'ita'] }),
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number().default(25),
        offset: z.coerce.number().default(0),
        shiftType: z.enum(enumShiftType.enumValues),
        date: z.string().regex(DATE_ONLY_PATTERN),
      })
    ),
    async (c) => {
      const { limit, offset, date, shiftType } = c.req.valid('query');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const data = await getDailyPlans(
        { limit, offset },
        {
          organizationId: user.organizationId,
          date,
          shiftType,
          status: 'active' satisfies DailyPlanStatus,
        }
      );

      return c.json(data, {
        headers: {
          'X-Total-Count': data[0]?.totalCount.toString() ?? '0',
        },
      });
    }
  )
  .get(
    '/daily-plans',
    rbac({ roles: ['dispatcher', 'admin', 'driver', 'markscheider', 'ita'] }),
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number().default(25),
        offset: z.coerce.number().default(0),
        shiftType: z.enum(enumShiftType.enumValues).optional(),
        status: z.enum(enumDailyPlanStatus.enumValues).optional(),
        date: z.string().optional(),
      })
    ),
    async (c) => {
      const { limit, offset, date, shiftType, status } = c.req.valid('query');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const normalizedFilters = resolveDailyPlansFilter({ date, shiftType });

      const data = await getDailyPlans(
        { limit, offset },
        {
          organizationId: user.organizationId,
          date: normalizedFilters.date,
          shiftType: normalizedFilters.shiftType,
          status,
        }
      );

      return c.json(data, {
        headers: {
          'X-Total-Count': data[0]?.totalCount.toString() ?? '0',
        },
      });
    }
  )
  .post(
    '/daily-plan',
    rbac({ roles: ['dispatcher', 'admin'] }),
    zValidator(
      'json',
      z.object({
        shiftType: z.enum(enumShiftType.enumValues),
        /** Өгөхгүй бол сонгосон овоолгын маршрутаас авна. */
        routeId: z.string().uuid().nullable().optional(),
        pickUpBlockId: z.string().uuid(),
        stockpileIds: z.array(z.string().uuid()),
        vehicleId: z.string().uuid(),
        date: z.string().regex(DATE_ONLY_PATTERN),
        transportAmount: z.string().optional(),
      })
    ),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');

      if (!['admin', 'dispatcher', 'superadmin'].includes(user.role)) {
        throw new HTTPException(403, {
          message: 'Only admins and dispatchers can create daily plans',
        });
      }

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const routeId =
        body.routeId ??
        (await getRouteIdForStockpiles(body.stockpileIds, user.organizationId));

      const plan = await createDailyPlan({
        ...body,
        routeId,
        createdBy: user.id,
        organizationId: user.organizationId,
      });

      return c.json(plan, 201);
    }
  )
  .put(
    '/daily-plan',
    rbac({ roles: ['dispatcher'] }),
    zValidator(
      'json',
      z.object({
        id: z.string().uuid(),
        /** Өгөхгүй бол овоолго солигдсон үед овоолгын маршрутаас авна. */
        routeId: z.string().uuid().nullable().optional(),
        pickUpBlockId: z.string().uuid().optional(),
        stockpileIds: z.array(z.string()).optional(),
        transportAmount: z.string().nullable().optional(),
        vehicleId: z.string().optional(),
        shiftType: z.enum(enumShiftType.enumValues).optional(),
        date: z.string().regex(DATE_ONLY_PATTERN).optional(),
        status: z.enum(enumDailyPlanStatus.enumValues).optional(),
        allowConcurrentActive: z.boolean().optional(),
      })
    ),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');

      // Only admin/dispatcher can update plans
      if (!['admin', 'dispatcher', 'superadmin'].includes(user.role)) {
        throw new HTTPException(403, {
          message: 'Only admins and dispatchers can update daily plans',
        });
      }

      const existingPlan = await getDailyPlanById(body.id);

      if (!existingPlan) {
        throw new HTTPException(404, {
          message: 'Daily plan not found',
        });
      }

      if (existingPlan.organizationId !== user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      if (body.status === 'active' && !body.allowConcurrentActive) {
        const conflictingPlan = await getActiveDailyPlanConflict(body.id);

        if (conflictingPlan) {
          throw new HTTPException(409, {
            message:
              'Ижил техник, огноо, ээлжтэй идэвхтэй төлөвлөгөө байна. Үргэлжлүүлбэл хоёулаа идэвхтэй болно.',
          });
        }
      }

      const routeId =
        body.routeId ??
        (body.stockpileIds && user.organizationId
          ? await getRouteIdForStockpiles(body.stockpileIds, user.organizationId)
          : null);

      const plan = await updateDailyPlan({ ...body, routeId: routeId ?? undefined });

      if (!plan) {
        throw new HTTPException(404, {
          message: 'Daily plan not found',
        });
      }

      return c.json(plan);
    }
  )
  .delete(
    '/daily-plan',
    rbac({ roles: ['dispatcher'] }),
    zValidator(
      'json',
      z.object({
        id: z.string().uuid(),
      })
    ),
    async (c) => {
      const { id } = c.req.valid('json');
      const user = c.get('currentUser');

      // Only admin/dispatcher can delete plans
      if (!['admin', 'dispatcher', 'superadmin'].includes(user.role)) {
        throw new HTTPException(403, {
          message: 'Only admins and dispatchers can delete daily plans',
        });
      }

      const activeWorklogs = await drizzleDb
        .select()
        .from(workLogs)
        .where(eq(workLogs.planId, id));

      if (activeWorklogs.length > 0) {
        throw new HTTPException(403, {
          message: 'Тус төлөвлөлт дээр аль хэдий нь ажил эхэлсэн байна.',
        });
      }

      const plan = await deleteDailyPlan(id);

      if (!plan) {
        throw new HTTPException(404, {
          message: 'Daily plan not found',
        });
      }

      return c.json({ success: true });
    }
  );

export default dailyPlanRoutes;
