import { getShiftByPk } from '$/context/shift';
import { getActiveExcaByPlanId, getVehicleByPk } from '$/context/vehicle';
import {
  bulkWorkLog,
  createWorkLog,
  deleteWorkLog,
  endWorkLog,
  getStartedWorkLog,
  startWorkLog,
  startWorkLogV2,
  updateWorkLog,
} from '$/context/work-log';
import { enumWorkLogStatus } from '$/libs/database/schema';
import { rbac } from '$/middlewares/rbac.middleware';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { ClientError, Forbidden } from '$/utils/errors';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

const worklogRoutes = new Hono<AppEnv>()
  .post(
    '/v2/work-log/start',
    zValidator(
      'json',
      z.object({
        shiftId: z.string(),
        planId: z.string(),
        stockpileId: z.string(),
        notes: z.string().optional(),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');

      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const workLog = await startWorkLogV2({
        input: body,
        organizationId: user.organizationId,
        userId: user.id,
      });

      return c.json(workLog);
    },
  )
  .post(
    '/work-log/start',
    zValidator(
      'json',
      z.object({
        shiftId: z.string(),
        planId: z.string(),
        stockpileId: z.string(),
        notes: z.string().optional(),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');

      const user = c.get('currentUser');

      // todo: check if user's role is driver
      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const started = await getStartedWorkLog(user.id);

      if (started !== null) {
        console.log(started, 'started');

        throw new ClientError(
          'Дуусгаагүй рэйсээ дуусгасны дараа шинээр рэйс эхлүүлнэ үү.',
        );
      }

      // const activeExca = await getActiveExcaByPlanId(body.planId);

      // if (activeExca !== null) {
      //   throw new ClientError('Экскаваторын ажилд гарсан байна.');
      // }

      const workLog = await startWorkLog(body);

      return c.json(workLog);
    },
  )
  .post(
    '/work-log/end',
    zValidator(
      'json',
      z.object({
        status: z.enum(enumWorkLogStatus.enumValues).default('completed'),
        notes: z.string().optional(),
        // Сүлжээгүй үед дуусгасан рейсийн бодит дууссан цаг (сүлжээ сэргэхэд илгээнэ).
        endTime: z.string().datetime({ offset: true }).optional(),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');

      const user = c.get('currentUser');

      // todo: check if user's role is driver
      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const workLog = await endWorkLog({ ...body, userId: user.id });

      return c.json(workLog);
    },
  )
  .post(
    '/work-log',
    rbac({ roles: ['admin', 'dispatcher'] }),
    zValidator(
      'json',
      z.object({
        shiftId: z.string().uuid(),
        planId: z.string().uuid(),
        stockpileId: z.string().uuid(),
        notes: z.string().optional(),
        startTime: z.string().transform((val) => new Date(val).toISOString()),
        endTime: z.string().transform((val) => new Date(val).toISOString()),
        status: z.enum(enumWorkLogStatus.enumValues).default('completed'),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      try {
        const createdWorkLog = await createWorkLog(body, user.organizationId);

        return c.json(createdWorkLog);
      } catch (error) {
        if (error instanceof Error) {
          throw new HTTPException(400, {
            message: error.message,
          });
        }

        throw error;
      }
    },
  )
  .post(
    '/work-log/bulk',
    zValidator(
      'json',
      z.object({
        shiftId: z.string(),
        workLogs: z.array(
          z.object({
            shiftId: z.string(),
            planId: z.string(),
            stockpileId: z.string(),
            notes: z.string().optional(),

            startTime: z.string(),
            endTime: z.string(),
            status: z.enum(enumWorkLogStatus.enumValues),
          }),
        ),
      }),
    ),
    async (c) => {
      const user = c.get('currentUser');
      const { shiftId, workLogs } = c.req.valid('json');

      if (workLogs.length === 0) {
        throw new ClientError('Рэйс байхгүй.');
      }

      if (!user.organizationId) {
        throw new Forbidden();
      }

      const shift = await getShiftByPk(shiftId);

      if (shift === null) {
        throw new ClientError('Ажлын ээлж олдсонгүй.');
      }

      const vehicle = await getVehicleByPk(shift.vehicleId);

      if (!vehicle) {
        throw new ClientError('Бүртгэлгүй техник.');
      }

      if (vehicle.type !== 'truck') {
        throw new ClientError('Техникийн төрөл буруу.');
      }

      if (shift?.driverId !== user.id) {
        throw new Forbidden();
      }

      if (shift.status !== 'started') {
        throw new ClientError('Ажлын ээлж дууссан байна.');
      }

      for (const worklog of workLogs) {
        if (worklog.status === 'in_progress') {
          throw new ClientError('Дуусгаагүй рэйс байна.');
        }
      }

      const created = await bulkWorkLog(
        workLogs.map((log) => ({
          ...log,
          startTime: new Date(log.startTime).toISOString(),
          endTime: new Date(log.endTime).toISOString(),
          shiftId,
        })),
      );

      return c.json(created);
    },
  )

  .put(
    '/work-log',
    rbac({ roles: ['admin', 'dispatcher'] }),
    zValidator(
      'json',
      z.object({
        id: z.string().uuid(),
        notes: z.string().optional(),
        planId: z.string().uuid().optional(),
        status: z.enum(enumWorkLogStatus.enumValues).optional(),
        stockpileId: z.string().uuid().optional(),
        startTime: z
          .string()
          .transform((val) => (val ? new Date(val).toISOString() : undefined))
          .optional(),
        endTime: z
          .string()
          .transform((val) => (val ? new Date(val).toISOString() : undefined))
          .optional(),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      try {
        const updatedWorkLog = await updateWorkLog(body);

        return c.json(updatedWorkLog);
      } catch (error) {
        if (error instanceof Error) {
          throw new HTTPException(400, {
            message: error.message,
          });
        }
        throw error;
      }
    },
  )
  .delete(
    '/work-log/:id',
    rbac({ roles: ['admin', 'dispatcher'] }),
    zValidator(
      'param',
      z.object({
        id: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid('param');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      try {
        const deletedWorkLog = await deleteWorkLog(id);
        return c.json(deletedWorkLog);
      } catch (error) {
        if (error instanceof Error) {
          throw new HTTPException(400, {
            message: error.message,
          });
        }
        throw error;
      }
    },
  );
export default worklogRoutes;
