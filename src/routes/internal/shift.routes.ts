import {
  deleteShift,
  endShift,
  getDriverShiftsWithWorkLogs,
  getShiftHistory,
  getShiftByPk,
  getStartedShift,
  startShift,
  updateShift,
  getActiveShiftByVehicleId,
} from '$/context/shift';
import { getUserByPk } from '$/context/user';
import { getVehicleByPk } from '$/context/vehicle';
import {
  enumDriverShiftGroup,
  enumShiftStatus,
  enumShiftType,
} from '$/libs/database/schema';
import { rbac } from '$/middlewares/rbac.middleware';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { ClientError } from '$/utils/errors';
import { DATE_ONLY_PATTERN } from '$/utils/operational-date';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

const shiftRoutes = new Hono<AppEnv>()
  .get(
    '/shifts',
    rbac({
      roles: [
        'admin',
        'dispatcher',
        'ita',
        'markscheider',
        'driver',
        'assistant_operator',
      ],
    }),
    zValidator(
      'query',
      z.object({
        status: z.enum(enumShiftStatus.enumValues).optional(),
      }),
    ),
    async (c) => {
      const { status } = c.req.valid('query');

      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const shiftList = await getStartedShift({
        status: status ?? 'started',
        driverId: user.id,
      });

      return c.json(shiftList);
    },
  )
  .get(
    '/shift-history',
    zValidator(
      'query',
      z.object({
        status: z.enum(enumShiftStatus.enumValues).optional(),
        limit: z.coerce.number(),
        offset: z.coerce.number(),
      }),
    ),
    async (c) => {
      const { status, limit, offset } = c.req.valid('query');

      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const shiftHistory = await getShiftHistory(
        {
          driverId: user.id,
          status,
        },
        {
          limit,
          offset,
        },
      );

      return c.json(shiftHistory);
    },
  )
  .post(
    '/shift',
    rbac({ roles: ['admin', 'dispatcher'] }),
    zValidator(
      'json',
      z.object({
        driverId: z.string().uuid(),
        vehicleId: z.string().uuid(),
        shiftType: z.enum(enumShiftType.enumValues),
        mileageStart: z.coerce.string(),
        motoStart: z.coerce.string(),
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

      const driver = await getUserByPk(body.driverId);

      if (!driver || driver.organizationId !== user.organizationId) {
        throw new HTTPException(404, {
          message: 'Оператор олдсонгүй.',
        });
      }

      if (!['driver', 'assistant_operator'].includes(driver.role)) {
        throw new ClientError('Сонгосон хэрэглэгч оператор биш байна.');
      }

      const vehicle = await getVehicleByPk(body.vehicleId);

      if (!vehicle || vehicle.organizationId !== user.organizationId) {
        throw new HTTPException(404, {
          message: 'Техник олдсонгүй.',
        });
      }

      if (driver.role === 'assistant_operator' && vehicle.type === 'truck') {
        throw new ClientError(
          'Туслах техник оператор автосамосвалаар ээлж эхлүүлэх боломжгүй.',
        );
      }

      const activeShiftWithVehicle = await getActiveShiftByVehicleId(
        body.vehicleId,
      );

      if (activeShiftWithVehicle !== null) {
        const assignedUser = await getUserByPk(activeShiftWithVehicle.driverId);

        throw new HTTPException(422, {
          message: `Өмнөх ээлжийн ажил дуусаагүй байна ${assignedUser?.firstName} ${assignedUser?.lastName} - ${assignedUser?.position}`,
        });
      }

      const started = await getStartedShift({
        status: 'started',
        driverId: body.driverId,
      });

      if (started) {
        throw new HTTPException(422, {
          message: 'Сонгосон оператор идэвхтэй ээлжтэй байна.',
        });
      }

      const shift = await startShift({
        ...body,
        organizationId: user.organizationId,
      });

      return c.json(shift);
    },
  )
  .post(
    '/v2/shift/start',
    zValidator(
      'json',
      z.object({
        vehicleId: z.string(),
        shiftType: z.enum(enumShiftType.enumValues),
        operationalDate: z.string().regex(DATE_ONLY_PATTERN),
        mileageStart: z.coerce.string(),
        motoStart: z.coerce.string(),
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

      const vehicle = await getVehicleByPk(body.vehicleId);

      if (!vehicle || vehicle.organizationId !== user.organizationId) {
        throw new HTTPException(404, {
          message: 'Техник олдсонгүй.',
        });
      }

      if (user.role === 'assistant_operator' && vehicle.type === 'truck') {
        throw new ClientError(
          'Туслах техник оператор автосамосвалаар ээлж эхлүүлэх боломжгүй.',
        );
      }

      const activeShiftWithVehicle = await getActiveShiftByVehicleId(
        body.vehicleId,
      );

      if (activeShiftWithVehicle !== null) {
        const user = await getUserByPk(activeShiftWithVehicle.driverId);

        throw new HTTPException(422, {
          message: `Өмнөх ээлжийн ажил дуусаагүй байна ${user?.firstName} ${user?.lastName} - ${user?.position}`,
        });
      }

      const started = await getStartedShift({
        status: 'started',
        driverId: user.id,
      });

      if (started) {
        console.log(started, 'started');

        throw new HTTPException(422, {
          message: 'Ээлж эхлүүлсэн байна.',
        });
      }

      const shift = await startShift({
        ...body,
        driverId: user.id,
        organizationId: user.organizationId,
      });

      return c.json(shift);
    },
  )
  .post(
    '/shift/start',
    // rbac({ roles: ['driver'] }),
    zValidator(
      'json',
      z.object({
        vehicleId: z.string(),
        shiftType: z.enum(enumShiftType.enumValues),
        mileageStart: z.coerce.string(),
        motoStart: z.coerce.string(),
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

      const vehicle = await getVehicleByPk(body.vehicleId);

      if (!vehicle || vehicle.organizationId !== user.organizationId) {
        throw new HTTPException(404, {
          message: 'Техник олдсонгүй.',
        });
      }

      if (user.role === 'assistant_operator' && vehicle.type === 'truck') {
        throw new ClientError(
          'Туслах техник оператор автосамосвалаар ээлж эхлүүлэх боломжгүй.',
        );
      }

      const activeShiftWithVehicle = await getActiveShiftByVehicleId(
        body.vehicleId,
      );

      if (activeShiftWithVehicle !== null) {
        const user = await getUserByPk(activeShiftWithVehicle.driverId);

        throw new HTTPException(422, {
          message: `Өмнөх ээлжийн ажил дуусаагүй байна ${user?.firstName} ${user?.lastName} - ${user?.position}`,
        });
      }

      const started = await getStartedShift({
        status: 'started',
        driverId: user.id,
      });

      if (started) {
        throw new HTTPException(422, {
          message: 'Ээлж эхлүүлсэн байна.',
        });
      }

      const shift = await startShift({
        ...body,
        driverId: user.id,
        organizationId: user.organizationId,
      });

      return c.json(shift);
    },
  )

  .post(
    '/shift/end',
    zValidator(
      'json',
      z.object({
        shiftId: z.string(),
        mileageEnd: z.coerce.string(),
        motoEnd: z.string(),
        notes: z.string().optional(),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');

      const shift = await getShiftByPk(body.shiftId);

      if (shift === null) {
        throw new HTTPException(422, {
          message: 'Ажлын ээлж олдсонгүй.',
        });
      }

      if (shift.driverId !== user.id) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const updated = await endShift({ ...body, shift });

      return c.json(updated);
    },
  )

  .put(
    '/shift',
    rbac({ roles: ['admin', 'dispatcher'] }),
    zValidator(
      'json',
      z.object({
        id: z.string().uuid(),
        vehicleId: z.string().optional(),
        driverShiftGroup: z.enum(enumDriverShiftGroup.enumValues).optional(),
        shiftType: z.enum(enumShiftType.enumValues).optional(),
        operationalDate: z
          .union([z.string().regex(DATE_ONLY_PATTERN), z.literal('')])
          .transform((val) => (val === '' ? undefined : val))
          .optional(),
        mileageStart: z
          .string()
          .transform((val) => (val === '' ? undefined : val))
          .optional(),
        mileageEnd: z
          .string()
          .transform((val) => (val === '' ? undefined : val))
          .optional(),
        motoStart: z
          .string()
          .transform((val) => (val === '' ? undefined : val))
          .optional(),
        motoEnd: z
          .string()
          .transform((val) => (val === '' ? undefined : val))
          .optional(),
        status: z.enum(enumShiftStatus.enumValues).optional(),
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

      const shift = await getShiftByPk(body.id);

      if (!shift) {
        throw new HTTPException(404, {
          message: 'Shift not found',
        });
      }

      try {
        const updatedShift = await updateShift(body);

        return c.json(updatedShift);
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
    '/shift',
    rbac({ roles: ['admin', 'dispatcher'] }),
    zValidator(
      'json',
      z.object({
        id: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid('json');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const shift = await getShiftByPk(id);

      if (!shift) {
        throw new HTTPException(404, {
          message: 'Shift not found',
        });
      }

      try {
        const deletedShift = await deleteShift(id);

        return c.json({ success: true, shift: deletedShift });
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

  .get(
    '/driver/shifts',
    // rbac({ roles: ['driver'] }),
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number().min(1).max(100).default(25),
        offset: z.coerce.number().min(0).default(0),
      }),
    ),
    async (c) => {
      const { limit, offset } = c.req.valid('query');
      const user = c.get('currentUser');

      if (!user.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      try {
        const shifts = await getDriverShiftsWithWorkLogs(
          { limit, offset },
          user.id,
          user.organizationId,
        );

        return c.json(shifts);
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

export default shiftRoutes;
