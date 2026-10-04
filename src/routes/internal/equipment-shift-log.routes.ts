import { Hono } from 'hono';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '$/utils/app-env';
import { rbac } from '$/middlewares/rbac.middleware';
import { drizzleDb } from '$/libs/database/db';

import {
    vehicles,
    shifts,
} from '$/libs/database/schema';

import {
    and,
    eq,
    isNull,
} from 'drizzle-orm';

import {
    getIdleReasonTypes,
    getIdleReasonTypesForVehicle,
    createIdleReasonType,
    updateIdleReasonType,
    deleteIdleReasonType,

    getRepairReasonTypes,
    getRepairReasonTypesForVehicle,
    createRepairReasonType,
    updateRepairReasonType,
    deleteRepairReasonType,

    getEquipmentOperators,
    getMechanics,
    getUsersByRoles,

    getShiftLogFormOptions,

    createShiftLog,
    createOrAppendRepair,

    getShiftLogs,
    getShiftLogById,
    updateShiftLog,
    deleteShiftLog,
} from '$/context/equipment-shift-log';

/* =========================================================
 * VALIDATION
 * ======================================================= */

const vehicleTypeSchema = z.enum([
    'truck',
    'excavator',
    'loader',
    'dozer',
    'dump',
    'light_vehicle',
    'special_purpose',
    'grader',
]);

const userRoleSchema = z.enum([
    'superadmin',
    'admin',
    'markscheider',
    'driver',
    'assistant_operator',
    'dispatcher',
    'hr',
    'ita',
    'mechanic',
]);

const idleEntrySchema = z
    .object({
        idleReasonId: z.string().uuid().optional().nullable(),

        hours: z.coerce
            .number()
            .positive()
            .multipleOf(
                0.1,
                '0.1-ийн үржвэр байх ёстой (6 мин = 0.1)'
            ),

        notes: z.string().min(1).optional().nullable(),
    })
    .refine(
        (value) => value.idleReasonId || value.notes,
        {
            message:
                'Сул зогсолтын шалтгаан эсвэл тайлбар оруулна уу',
        }
    );

const repairEntrySchema = z
    .object({
        repairReasonId: z
            .string()
            .uuid()
            .optional()
            .nullable(),

        mechanicId: z
            .string()
            .uuid()
            .optional()
            .nullable(),

        hours: z.coerce
            .number()
            .positive()
            .multipleOf(
                0.1,
                '0.1-ийн үржвэр байх ёстой (6 мин = 0.1)'
            ),

        notes: z
            .string()
            .min(1)
            .optional()
            .nullable(),
    })
    .refine(
        (value) =>
            value.repairReasonId ||
            value.notes,
        {
            message:
                'Эвдрэл гэмтлийн шалтгаан эсвэл тайлбар оруулна уу',
        }
    );

const shiftLogBodySchema = z.object({
    vehicleId: z.string().uuid(),

    shiftId: z.string().uuid().optional().nullable(),

    operatorId: z.string().uuid().optional().nullable(),

    operationalDate: z
        .string()
        .regex(
            /^\d{4}-\d{2}-\d{2}$/,
            'YYYY-MM-DD формат байх ёстой'
        ),

    shiftType: z.enum([
        'day',
        'night',
    ]),

    totalHours: z.coerce
        .number()
        .min(0),

    workedHours: z.coerce
        .number()
        .min(0),

    repairHours: z.coerce
        .number()
        .min(0),

    idleHours: z.coerce
        .number()
        .min(0),

    fuelReceived: z.coerce
        .number()
        .min(0)
        .optional()
        .nullable(),

    notes: z
        .string()
        .optional()
        .nullable(),

    idleEntries: z
        .array(idleEntrySchema)
        .default([]),

    repairEntries: z
        .array(repairEntrySchema)
        .default([]),
});

/* =========================================================
 * ROUTER
 * ======================================================= */

const equipmentShiftLogRoutes = new Hono<AppEnv>()

    /* =====================================================
     * IDLE REASONS
     * =================================================== */

    .get(
        '/idle-reasons',
        rbac({
            roles: [
                'admin',
                'dispatcher',
                'mechanic',
            ],
        }),
        zValidator(
            'query',
            z.object({
                vehicleType: vehicleTypeSchema.optional(),
            })
        ),
        async (c) => {
            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const { vehicleType } =
                c.req.valid('query');

            const data = vehicleType
                ? await getIdleReasonTypesForVehicle(
                    user.organizationId,
                    vehicleType
                )
                : await getIdleReasonTypes(
                    user.organizationId
                );

            return c.json(data);
        }
    )

    .post(
        '/idle-reasons',
        rbac({
            roles: ['admin'],
        }),
        zValidator(
            'json',
            z.object({
                name: z
                    .string()
                    .min(1)
                    .max(100),

                vehicleTypes: z
                    .array(vehicleTypeSchema)
                    .default([]),
            })
        ),
        async (c) => {
            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const body = c.req.valid('json');

            try {
                const result =
                    await createIdleReasonType({
                        organizationId:
                            user.organizationId,

                        name:
                            body.name,

                        vehicleTypes:
                            body.vehicleTypes,
                    });

                return c.json(result, 201);
            } catch (err: unknown) {
                if (
                    (
                        err as {
                            code?: string;
                        }
                    )?.code === '23505'
                ) {
                    throw new HTTPException(
                        409,
                        {
                            message:
                                'Энэ нэртэй сул зогсолтын шалтгаан аль хэдийн байна',
                        }
                    );
                }

                throw err;
            }
        }
    )

    .put(
        '/idle-reasons/:id',
        rbac({
            roles: ['admin'],
        }),
        zValidator(
            'json',
            z.object({
                name: z
                    .string()
                    .min(1)
                    .max(100)
                    .optional(),

                vehicleTypes: z
                    .array(vehicleTypeSchema)
                    .optional(),

                isActive: z
                    .boolean()
                    .optional(),
            })
        ),
        async (c) => {
            const { id } = c.req.param();

            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const result =
                await updateIdleReasonType(
                    id,
                    user.organizationId,
                    c.req.valid('json')
                );

            if (!result) {
                throw new HTTPException(
                    404,
                    {
                        message:
                            'Олдсонгүй',
                    }
                );
            }

            return c.json(result);
        }
    )

    .delete(
        '/idle-reasons/:id',
        rbac({
            roles: ['admin'],
        }),
        async (c) => {
            const { id } = c.req.param();

            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const result =
                await deleteIdleReasonType(
                    id,
                    user.organizationId
                );

            if (!result) {
                throw new HTTPException(
                    404,
                    {
                        message:
                            'Олдсонгүй',
                    }
                );
            }

            return c.json({
                message:
                    'Устгагдлаа',
            });
        }
    )

    /* =====================================================
     * REPAIR REASONS
     * =================================================== */

    .get(
        '/repair-reasons',
        rbac({
            roles: [
                'admin',
                'dispatcher',
                'mechanic',
            ],
        }),
        zValidator(
            'query',
            z.object({
                vehicleType: vehicleTypeSchema.optional(),
            })
        ),
        async (c) => {
            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const { vehicleType } =
                c.req.valid('query');

            const data = vehicleType
                ? await getRepairReasonTypesForVehicle(
                    user.organizationId,
                    vehicleType
                )
                : await getRepairReasonTypes(
                    user.organizationId
                );

            return c.json(data);
        }
    )

    .post(
        '/repair-reasons',
        rbac({
            roles: ['admin'],
        }),
        zValidator(
            'json',
            z.object({
                name: z
                    .string()
                    .min(1)
                    .max(100),

                vehicleTypes: z
                    .array(vehicleTypeSchema)
                    .default([]),
            })
        ),
        async (c) => {
            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const body = c.req.valid('json');

            try {
                const result =
                    await createRepairReasonType(
                        {
                            organizationId:
                                user.organizationId,

                            name:
                                body.name,

                            vehicleTypes:
                                body.vehicleTypes,
                        }
                    );

                return c.json(result, 201);
            } catch (err: unknown) {
                if (
                    (
                        err as {
                            code?: string;
                        }
                    )?.code === '23505'
                ) {
                    throw new HTTPException(
                        409,
                        {
                            message:
                                'Энэ нэртэй эвдрэл гэмтлийн шалтгаан аль хэдийн байна',
                        }
                    );
                }

                throw err;
            }
        }
    )

    .put(
        '/repair-reasons/:id',
        rbac({
            roles: ['admin'],
        }),
        zValidator(
            'json',
            z.object({
                name: z
                    .string()
                    .min(1)
                    .max(100)
                    .optional(),

                vehicleTypes: z
                    .array(vehicleTypeSchema)
                    .optional(),

                isActive: z
                    .boolean()
                    .optional(),
            })
        ),
        async (c) => {
            const { id } = c.req.param();

            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const result =
                await updateRepairReasonType(
                    id,
                    user.organizationId,
                    c.req.valid('json')
                );

            if (!result) {
                throw new HTTPException(
                    404,
                    {
                        message:
                            'Олдсонгүй',
                    }
                );
            }

            return c.json(result);
        }
    )

    .delete(
        '/repair-reasons/:id',
        rbac({
            roles: ['admin'],
        }),
        async (c) => {
            const { id } = c.req.param();

            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const result =
                await deleteRepairReasonType(
                    id,
                    user.organizationId
                );

            if (!result) {
                throw new HTTPException(
                    404,
                    {
                        message:
                            'Олдсонгүй',
                    }
                );
            }

            return c.json({
                message:
                    'Устгагдлаа',
            });
        }
    )

    /* =====================================================
     * USERS
     * =================================================== */

    .get(
        '/operators',
        rbac({
            roles: [
                'admin',
                'dispatcher',
                'mechanic',
            ],
        }),
        async (c) => {
            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const data =
                await getEquipmentOperators(
                    user.organizationId
                );

            return c.json(data);
        }
    )

    .get(
        '/mechanics',
        rbac({
            roles: [
                'admin',
                'dispatcher',
                'mechanic',
            ],
        }),
        async (c) => {
            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const data =
                await getMechanics(
                    user.organizationId
                );

            return c.json(data);
        }
    )

    .get(
        '/users-by-role',
        rbac({
            roles: [
                'admin',
                'dispatcher',
                'mechanic',
            ],
        }),
        zValidator(
            'query',
            z.object({
                role:
                    userRoleSchema,
            })
        ),
        async (c) => {
            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const { role } =
                c.req.valid('query');

            const data =
                await getUsersByRoles(
                    user.organizationId,
                    [role]
                );

            return c.json(data);
        }
    )

    /* =====================================================
     * FORM OPTIONS
     * =================================================== */

    .get(
        '/form-options',
        rbac({
            roles: [
                'admin',
                'dispatcher',
                'mechanic',
            ],
        }),
        zValidator(
            'query',
            z.object({
                vehicleType:
                    vehicleTypeSchema,
            })
        ),
        async (c) => {
            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const { vehicleType } =
                c.req.valid('query');

            const data =
                await getShiftLogFormOptions(
                    user.organizationId,
                    vehicleType
                );

            return c.json(data);
        }
    )

    /* =====================================================
     * CREATE SHIFT LOG
     * =================================================== */

    .post(
        '/logs',
        rbac({
            roles: [
                'admin',
                'dispatcher',
                'mechanic',
            ],
        }),
        zValidator(
            'json',
            shiftLogBodySchema
        ),
        async (c) => {
            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const {
                idleEntries,
                repairEntries,
                ...body
            } =
                c.req.valid('json');

            try {
                const created =
                    await createShiftLog(
                        user.organizationId,
                        {
                            ...body,
                            recordedBy:
                                user.id,
                        },
                        idleEntries,
                        repairEntries
                    );

                return c.json(
                    created,
                    201
                );
            } catch (err: unknown) {
                if (
                    (
                        err as {
                            code?: string;
                        }
                    )?.code === '23505'
                ) {
                    throw new HTTPException(
                        409,
                        {
                            message:
                                'Энэ техник, огноо, ээлжийн бүртгэл аль хэдийн байна',
                        }
                    );
                }

                throw err;
            }
        }
    )

    /* =====================================================
     * CREATE / APPEND REPAIR
     * =================================================== */

    .post(
        '/logs/repair',

        rbac({
            roles: [
                'admin',
                'dispatcher',
                'mechanic',
            ],
        }),

        zValidator(
            'json',

            z.object({
                vehicleId:
                    z.string().uuid(),

                shiftId:
                    z.string()
                        .uuid()
                        .optional()
                        .nullable(),

                operatorId:
                    z.string()
                        .uuid()
                        .optional()
                        .nullable(),

                operationalDate:
                    z.string().regex(
                        /^\d{4}-\d{2}-\d{2}$/,
                        'YYYY-MM-DD формат байх ёстой'
                    ),

                shiftType:
                    z.enum([
                        'day',
                        'night',
                    ]),

                repairEntries:
                    z.array(
                        repairEntrySchema
                    )
                        .min(
                            1,
                            'Засварын мэдээлэл оруулна уу'
                        ),
            })
        ),

        async (c) => {
            const user =
                c.get(
                    'currentUser'
                );

            if (
                !user.organizationId
            ) {
                throw new HTTPException(
                    403,
                    {
                        message:
                            'Unauthorized',
                    }
                );
            }

            const body =
                c.req.valid(
                    'json'
                );

            try {
                const result =
                    await createOrAppendRepair(
                        user.organizationId,
                        {
                            vehicleId:
                                body.vehicleId,

                            shiftId:
                                body.shiftId ??
                                null,

                            operatorId:
                                body.operatorId ??
                                null,

                            operationalDate:
                                body.operationalDate,

                            shiftType:
                                body.shiftType,

                            repairEntries:
                                body.repairEntries,

                            recordedBy:
                                user.id,
                        }
                    );

                return c.json(
                    result,
                    result.created
                        ? 201
                        : 200
                );
            } catch (
            err: unknown
            ) {
                /*
                 * Race condition:
                 *
                 * хоёр request яг зэрэг existing
                 * shift байхгүй гэж уншаад
                 * INSERT хийх боломжтой.
                 *
                 * DB unique constraint үүнийг
                 * хамгаалсаар байна.
                 */

                if (
                    (
                        err as {
                            code?: string;
                        }
                    )?.code ===
                    '23505'
                ) {
                    throw new HTTPException(
                        409,
                        {
                            message:
                                'Энэ техник, огноо, ээлжийн бүртгэл дээр давхардсан хүсэлт ирлээ. Дахин оролдоно уу.',
                        }
                    );
                }

                throw err;
            }
        }
    )

    /* =====================================================
     * SHIFT LOG LIST
     * =================================================== */

    .get(
        '/logs',
        rbac({
            roles: [
                'admin',
                'dispatcher',
                'mechanic',
            ],
        }),
        zValidator(
            'query',
            z.object({
                limit: z.coerce
                    .number()
                    .int()
                    .positive()
                    .max(200)
                    .default(50),

                offset: z.coerce
                    .number()
                    .int()
                    .min(0)
                    .default(0),

                startDate:
                    z.string().optional(),

                endDate:
                    z.string().optional(),

                vehicleId:
                    z.string()
                        .uuid()
                        .optional(),
            })
        ),
        async (c) => {
            const user = c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const input =
                c.req.valid('query');

            const logs =
                await getShiftLogs({
                    organizationId:
                        user.organizationId,

                    ...input,
                });

            const totalCount =
                logs[0]?.totalCount ?? 0;

            return c.json(
                logs,
                {
                    headers: {
                        'X-Total-Count':
                            String(
                                totalCount
                            ),
                    },
                }
            );
        }
    )

    /* =====================================================
     * SHIFT LOG DETAIL
     * =================================================== */

    .get(
        '/logs/:id',
        rbac({
            roles: [
                'admin',
                'dispatcher',
                'mechanic',
            ],
        }),
        async (c) => {
            const { id } =
                c.req.param();

            const user =
                c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const log =
                await getShiftLogById(
                    id,
                    user.organizationId
                );

            if (!log) {
                throw new HTTPException(
                    404,
                    {
                        message:
                            'Бүртгэл олдсонгүй',
                    }
                );
            }

            return c.json(log);
        }
    )

    /* =====================================================
     * VEHICLES BY DATE
     * =================================================== */

    .get(
        '/vehicles-by-date',
        rbac({
            roles: [
                'admin',
                'dispatcher',
                'mechanic',
            ],
        }),
        zValidator(
            'query',
            z.object({
                date:
                    z.string().regex(
                        /^\d{4}-\d{2}-\d{2}$/,
                        'YYYY-MM-DD формат байх ёстой'
                    ),
            })
        ),
        async (c) => {
            const { date } =
                c.req.valid('query');

            const user =
                c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const result =
                await drizzleDb
                    .selectDistinct({
                        id:
                            vehicles.id,

                        name:
                            vehicles.name,

                        mineNumber:
                            vehicles.mineNumber,

                        type:
                            vehicles.type,
                    })
                    .from(shifts)
                    .innerJoin(
                        vehicles,
                        and(
                            eq(
                                shifts.vehicleId,
                                vehicles.id
                            ),
                            isNull(
                                vehicles.deletedAt
                            )
                        )
                    )
                    .where(
                        and(
                            eq(
                                shifts.organizationId,
                                user.organizationId
                            ),
                            eq(
                                shifts.operationalDate,
                                date
                            )
                        )
                    )
                    .orderBy(
                        vehicles.mineNumber
                    );

            return c.json(
                result
            );
        }
    )

    /* =====================================================
     * UPDATE SHIFT LOG
     * =================================================== */

    .put(
        '/logs/:id',
        rbac({
            roles: [
                'admin',
                'dispatcher',
                'mechanic',
            ],
        }),
        zValidator(
            'json',
            shiftLogBodySchema
                .partial()
                .extend({
                    idleEntries:
                        z.array(
                            idleEntrySchema
                        )
                            .optional(),

                    repairEntries:
                        z.array(
                            repairEntrySchema
                        )
                            .optional(),
                })
        ),
        async (c) => {
            const { id } =
                c.req.param();

            const user =
                c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const {
                idleEntries,
                repairEntries,
                ...body
            } =
                c.req.valid('json');

            const log =
                await updateShiftLog(
                    id,
                    user.organizationId,
                    {
                        ...(body.totalHours !==
                            undefined && {
                            totalHours:
                                String(
                                    body.totalHours
                                ),
                        }),

                        ...(body.workedHours !==
                            undefined && {
                            workedHours:
                                body.workedHours !=
                                    null
                                    ? String(
                                        body.workedHours
                                    )
                                    : null,
                        }),

                        ...(body.idleHours !==
                            undefined && {
                            idleHours:
                                body.idleHours !=
                                    null
                                    ? String(
                                        body.idleHours
                                    )
                                    : null,
                        }),

                        ...(body.repairHours !==
                            undefined && {
                            repairHours:
                                body.repairHours !=
                                    null
                                    ? String(
                                        body.repairHours
                                    )
                                    : null,
                        }),

                        ...(body.operatorId !==
                            undefined && {
                            operatorId:
                                body.operatorId ??
                                null,
                        }),

                        ...(body.fuelReceived !==
                            undefined && {
                            fuelReceived:
                                body.fuelReceived !=
                                    null
                                    ? String(
                                        body.fuelReceived
                                    )
                                    : null,
                        }),

                        ...(body.notes !==
                            undefined && {
                            notes:
                                body.notes ??
                                null,
                        }),
                    },
                    idleEntries,
                    repairEntries
                );

            if (!log) {
                throw new HTTPException(
                    404,
                    {
                        message:
                            'Бүртгэл олдсонгүй',
                    }
                );
            }

            return c.json(log);
        }
    )

    /* =====================================================
     * DELETE SHIFT LOG
     * =================================================== */

    .delete(
        '/logs/:id',
        rbac({
            roles: [
                'admin',
                'dispatcher',
            ],
        }),
        async (c) => {
            const { id } =
                c.req.param();

            const user =
                c.get('currentUser');

            if (!user.organizationId) {
                throw new HTTPException(403, {
                    message: 'Unauthorized',
                });
            }

            const deleted =
                await deleteShiftLog(
                    id,
                    user.organizationId
                );

            if (!deleted) {
                throw new HTTPException(
                    404,
                    {
                        message:
                            'Бүртгэл олдсонгүй',
                    }
                );
            }

            return c.json({
                message:
                    'Устгагдлаа',
            });
        }
    );

export default equipmentShiftLogRoutes;