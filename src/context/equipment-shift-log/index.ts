import { drizzleDb } from '$/libs/database/db';

import {
    equipmentShiftLogs,
    equipmentIdleEntries,
    equipmentRepairEntries,
    idleReasonTypes,
    repairReasonTypes,
    vehicles,
    users,
} from '$/libs/database/schema';

import {
    first,
    firstOrNull,
} from '$/libs/database/utils';

import {
    and,
    desc,
    eq,
    gte,
    lte,
    sql,
    getTableColumns,
    inArray,
} from 'drizzle-orm';

export type ShiftLogInsert =
    typeof equipmentShiftLogs.$inferInsert;

export type IdleEntryPayload = {
    idleReasonId?: string | null;
    hours: number;
    notes?: string | null;
};

export type RepairEntryPayload = {
    repairReasonId?: string | null;
    mechanicId?: string | null;
    hours: number;
    notes?: string | null;
};

export type EquipmentUserRole =
    | 'superadmin'
    | 'admin'
    | 'markscheider'
    | 'driver'
    | 'assistant_operator'
    | 'dispatcher'
    | 'hr'
    | 'ita'
    | 'mechanic';

const round1 = (value: number) =>
    Math.round(value * 10) / 10;

const toNumber = (
    value: unknown,
    fallback = 0
) => {
    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
};

/**
 * Сул зогсолтын entry-г DB insert хийх хэлбэрт оруулна.
 *
 * Автоматаар idleHours бодохгүй.
 * Зөвхөн entry хадгална.
 */
const normalizeIdleEntries = (
    idleEntries: IdleEntryPayload[] = []
) => {
    return idleEntries
        .filter(
            (entry) =>
                toNumber(entry.hours) > 0
        )
        .map((entry) => ({
            idleReasonId:
                entry.idleReasonId ?? null,

            hours: String(
                round1(
                    toNumber(entry.hours)
                )
            ),

            notes:
                entry.notes ?? null,
        }));
};

const normalizeRepairEntries = (
    repairEntries: RepairEntryPayload[] = []
) => {
    return repairEntries
        .filter(
            (entry) =>
                toNumber(entry.hours) > 0
        )
        .map((entry) => ({
            repairReasonId:
                entry.repairReasonId ?? null,

            mechanicId:
                entry.mechanicId ?? null,

            hours: String(
                round1(
                    toNumber(entry.hours)
                )
            ),

            notes:
                entry.notes ?? null,
        }));
};

export const getUsersByRoles = async (
    organizationId: string,
    roles: EquipmentUserRole[]
) => {
    if (!roles.length) {
        return [];
    }

    return drizzleDb
        .select({
            id: users.id,

            name: users.name,

            firstName:
                users.firstName,

            lastName:
                users.lastName,

            role:
                users.role,

            position:
                users.position,

            department:
                users.department,

            status:
                users.status,
        })
        .from(users)
        .where(
            and(
                eq(
                    users.organizationId,
                    organizationId
                ),

                eq(
                    users.isActive,
                    true
                ),

                inArray(
                    users.role,
                    roles
                )
            )
        )
        .orderBy(
            users.name,
            users.firstName
        );
};

/**
 * Техник дээр ажиллах operator-ууд.
 *
 * Хэрэв зөвхөн driver авах хэрэгтэй бол
 * assistant_operator-ийг хасаж болно.
 */
export const getEquipmentOperators = async (
    organizationId: string
) => {
    return getUsersByRoles(
        organizationId,
        [
            'driver',
            'assistant_operator',
        ]
    );
};

/**
 * Засварчин.
 */
export const getMechanics = async (
    organizationId: string
) => {
    return getUsersByRoles(
        organizationId,
        [
            'mechanic',
        ]
    );
};

/* =========================================================
 * IDLE REASON TYPES
 * ======================================================= */

/**
 * Бүх active сул зогсолтын шалтгаан.
 */
export const getIdleReasonTypes = async (
    organizationId: string
) => {
    return drizzleDb
        .select()
        .from(idleReasonTypes)
        .where(
            and(
                eq(
                    idleReasonTypes.organizationId,
                    organizationId
                ),

                eq(
                    idleReasonTypes.isActive,
                    true
                )
            )
        )
        .orderBy(
            idleReasonTypes.name
        );
};

/**
 * Vehicle type-аас хамаарсан
 * сул зогсолтын шалтгаан.
 *
 * vehicleTypes = [] бол бүх техникт харагдана.
 */
export const getIdleReasonTypesForVehicle =
    async (
        organizationId: string,
        vehicleType: string
    ) => {
        return drizzleDb
            .select()
            .from(idleReasonTypes)
            .where(
                and(
                    eq(
                        idleReasonTypes.organizationId,
                        organizationId
                    ),

                    eq(
                        idleReasonTypes.isActive,
                        true
                    ),

                    sql`
                        (
                            COALESCE(
                                array_length(
                                    ${idleReasonTypes.vehicleTypes},
                                    1
                                ),
                                0
                            ) = 0

                            OR

                            ${vehicleType}
                            = ANY(
                                ${idleReasonTypes.vehicleTypes}
                            )
                        )
                    `
                )
            )
            .orderBy(
                idleReasonTypes.name
            );
    };

export const createIdleReasonType = async (
    input:
        typeof idleReasonTypes.$inferInsert
) => {
    return first(
        await drizzleDb
            .insert(idleReasonTypes)
            .values(input)
            .returning()
    );
};

export const updateIdleReasonType = async (
    id: string,
    organizationId: string,
    input: Partial<
        typeof idleReasonTypes.$inferInsert
    >
) => {
    return first(
        await drizzleDb
            .update(idleReasonTypes)
            .set({
                ...input,

                updatedAt:
                    new Date().toISOString(),
            })
            .where(
                and(
                    eq(
                        idleReasonTypes.id,
                        id
                    ),

                    eq(
                        idleReasonTypes.organizationId,
                        organizationId
                    )
                )
            )
            .returning()
    );
};

export const deleteIdleReasonType = async (
    id: string,
    organizationId: string
) => {
    return first(
        await drizzleDb
            .update(idleReasonTypes)
            .set({
                isActive: false,

                updatedAt:
                    new Date().toISOString(),
            })
            .where(
                and(
                    eq(
                        idleReasonTypes.id,
                        id
                    ),

                    eq(
                        idleReasonTypes.organizationId,
                        organizationId
                    )
                )
            )
            .returning()
    );
};

/* =========================================================
 * REPAIR REASON TYPES
 * ======================================================= */

/**
 * Бүх active эвдрэл гэмтлийн шалтгаан.
 */
export const getRepairReasonTypes = async (
    organizationId: string
) => {
    return drizzleDb
        .select()
        .from(repairReasonTypes)
        .where(
            and(
                eq(
                    repairReasonTypes.organizationId,
                    organizationId
                ),

                eq(
                    repairReasonTypes.isActive,
                    true
                )
            )
        )
        .orderBy(
            repairReasonTypes.name
        );
};

/**
 * Vehicle type-аас хамаарсан
 * эвдрэл гэмтлийн шалтгаан.
 */
export const getRepairReasonTypesForVehicle =
    async (
        organizationId: string,
        vehicleType: string
    ) => {
        return drizzleDb
            .select()
            .from(repairReasonTypes)
            .where(
                and(
                    eq(
                        repairReasonTypes.organizationId,
                        organizationId
                    ),

                    eq(
                        repairReasonTypes.isActive,
                        true
                    ),

                    sql`
                        (
                            COALESCE(
                                array_length(
                                    ${repairReasonTypes.vehicleTypes},
                                    1
                                ),
                                0
                            ) = 0

                            OR

                            ${vehicleType}
                            = ANY(
                                ${repairReasonTypes.vehicleTypes}
                            )
                        )
                    `
                )
            )
            .orderBy(
                repairReasonTypes.name
            );
    };

export const createRepairReasonType = async (
    input:
        typeof repairReasonTypes.$inferInsert
) => {
    return first(
        await drizzleDb
            .insert(repairReasonTypes)
            .values(input)
            .returning()
    );
};

export const updateRepairReasonType = async (
    id: string,
    organizationId: string,
    input: Partial<
        typeof repairReasonTypes.$inferInsert
    >
) => {
    return first(
        await drizzleDb
            .update(repairReasonTypes)
            .set({
                ...input,

                updatedAt:
                    new Date().toISOString(),
            })
            .where(
                and(
                    eq(
                        repairReasonTypes.id,
                        id
                    ),

                    eq(
                        repairReasonTypes.organizationId,
                        organizationId
                    )
                )
            )
            .returning()
    );
};

export const deleteRepairReasonType = async (
    id: string,
    organizationId: string
) => {
    return first(
        await drizzleDb
            .update(repairReasonTypes)
            .set({
                isActive: false,

                updatedAt:
                    new Date().toISOString(),
            })
            .where(
                and(
                    eq(
                        repairReasonTypes.id,
                        id
                    ),

                    eq(
                        repairReasonTypes.organizationId,
                        organizationId
                    )
                )
            )
            .returning()
    );
};

/* =========================================================
 * FORM OPTIONS
 * ======================================================= */

/**
 * Frontend form нээгдэхэд хэрэгтэй бүх dropdown data.
 *
 * - idleReasons
 * - repairReasons
 * - operators
 * - mechanics
 */
export const getShiftLogFormOptions =
    async (
        organizationId: string,
        vehicleType: string
    ) => {
        const [
            idleReasons,
            repairReasons,
            operators,
            mechanics,
        ] = await Promise.all([
            getIdleReasonTypesForVehicle(
                organizationId,
                vehicleType
            ),

            getRepairReasonTypesForVehicle(
                organizationId,
                vehicleType
            ),

            getEquipmentOperators(
                organizationId
            ),

            getMechanics(
                organizationId
            ),
        ]);

        return {
            idleReasons,
            repairReasons,
            operators,
            mechanics,
        };
    };


/* =========================================================
 * CREATE SHIFT LOG
 * ======================================================= */

export const createShiftLog = async (
    organizationId: string,

    input: {
        vehicleId: string;
        shiftId?: string | null;
        operatorId?: string | null;
        operationalDate: string;
        shiftType: 'day' | 'night';

        totalHours: number;
        workedHours: number;
        repairHours: number;
        idleHours: number;

        fuelReceived?: number | null;
        notes?: string | null;
        recordedBy?: string | null;
    },

    idleEntries: IdleEntryPayload[] = [],

    repairEntries: RepairEntryPayload[] = []
) => {
    return drizzleDb.transaction(
        async (tx) => {
            const created =
                await firstOrNull(
                    await tx
                        .insert(
                            equipmentShiftLogs
                        )
                        .values({
                            organizationId,

                            vehicleId:
                                input.vehicleId,

                            shiftId:
                                input.shiftId ??
                                null,

                            operatorId:
                                input.operatorId ??
                                null,

                            operationalDate:
                                input.operationalDate,

                            shiftType:
                                input.shiftType,

                            /*
                             * Ямар ч автомат тооцоо хийхгүй.
                             * Frontend-аас ирсэн утгыг шууд хадгална.
                             */
                            totalHours:
                                String(
                                    round1(
                                        toNumber(
                                            input.totalHours
                                        )
                                    )
                                ),

                            workedHours:
                                String(
                                    round1(
                                        toNumber(
                                            input.workedHours
                                        )
                                    )
                                ),

                            repairHours:
                                String(
                                    round1(
                                        toNumber(
                                            input.repairHours
                                        )
                                    )
                                ),

                            idleHours:
                                String(
                                    round1(
                                        toNumber(
                                            input.idleHours
                                        )
                                    )
                                ),

                            fuelReceived:
                                input.fuelReceived ===
                                    undefined ||
                                    input.fuelReceived ===
                                    null
                                    ? null
                                    : String(
                                        round1(
                                            toNumber(
                                                input.fuelReceived
                                            )
                                        )
                                    ),

                            notes:
                                input.notes ??
                                null,

                            recordedBy:
                                input.recordedBy ??
                                null,

                            updatedAt:
                                new Date().toISOString(),
                        })
                        .returning()
                );

            if (!created) {
                throw new Error(
                    'Цаг ашиглалтын бүртгэл үүссэнгүй'
                );
            }

            /*
             * ===================================
             * IDLE ENTRIES
             * ===================================
             */

            const normalizedIdleEntries =
                normalizeIdleEntries(
                    idleEntries
                );

            if (
                normalizedIdleEntries.length >
                0
            ) {
                await tx
                    .insert(
                        equipmentIdleEntries
                    )
                    .values(
                        normalizedIdleEntries.map(
                            (entry) => ({
                                shiftLogId:
                                    created.id,

                                idleReasonId:
                                    entry.idleReasonId,

                                hours:
                                    entry.hours,

                                notes:
                                    entry.notes,
                            })
                        )
                    );
            }

            /*
             * ===================================
             * REPAIR ENTRIES
             * ===================================
             */

            const normalizedRepairEntries =
                normalizeRepairEntries(
                    repairEntries
                );

            if (
                normalizedRepairEntries.length >
                0
            ) {
                await tx
                    .insert(
                        equipmentRepairEntries
                    )
                    .values(
                        normalizedRepairEntries.map(
                            (entry) => ({
                                shiftLogId:
                                    created.id,

                                repairReasonId:
                                    entry.repairReasonId,

                                mechanicId:
                                    entry.mechanicId,

                                hours:
                                    entry.hours,

                                notes:
                                    entry.notes,
                            })
                        )
                    );
            }
            return created;
        }
    );
};


export const createOrAppendRepair = async (
    organizationId: string,
    input: {
        vehicleId: string;
        shiftId?: string | null;
        operatorId?: string | null;

        operationalDate: string;
        shiftType: 'day' | 'night';

        repairEntries: RepairEntryPayload[];

        recordedBy?: string | null;
    }
) => {
    const incomingRepairEntries =
        normalizeRepairEntries(
            input.repairEntries
        );

    if (
        incomingRepairEntries.length === 0
    ) {
        throw new Error(
            'Засварын мэдээлэл хоосон байна'
        );
    }

    return drizzleDb.transaction(
        async (tx) => {
            /*
             * =========================================
             * 1. EXISTING SHIFT LOG ОЛНО
             * =========================================
             *
             * Нэг shift-ийн identity:
             *
             * organization
             * + vehicle
             * + operationalDate
             * + shiftType
             */

            const existingShift =
                await firstOrNull(
                    await tx
                        .select()
                        .from(
                            equipmentShiftLogs
                        )
                        .where(
                            and(
                                eq(
                                    equipmentShiftLogs.organizationId,
                                    organizationId
                                ),
                                eq(
                                    equipmentShiftLogs.vehicleId,
                                    input.vehicleId
                                ),
                                eq(
                                    equipmentShiftLogs.operationalDate,
                                    input.operationalDate
                                ),
                                eq(
                                    equipmentShiftLogs.shiftType,
                                    input.shiftType
                                )
                            )
                        )
                        .limit(1)
                );

            /*
             * =========================================
             * 2. SHIFT БАЙХГҮЙ
             * =========================================
             *
             * Шинэ parent shift үүсгэнэ.
             */

            if (!existingShift) {
                const repairHours =
                    incomingRepairEntries.reduce(
                        (
                            sum,
                            entry
                        ) =>
                            sum +
                            toNumber(
                                entry.hours
                            ),
                        0
                    );

                const created =
                    await firstOrNull(
                        await tx
                            .insert(
                                equipmentShiftLogs
                            )
                            .values({
                                organizationId,

                                vehicleId:
                                    input.vehicleId,

                                shiftId:
                                    input.shiftId ??
                                    null,

                                operatorId:
                                    input.operatorId ??
                                    null,

                                operationalDate:
                                    input.operationalDate,

                                shiftType:
                                    input.shiftType,

                                /*
                                 * Repair module-оос
                                 * шинээр үүсэж байгаа shift.
                                 *
                                 * Автомат trigger байхгүй.
                                 */
                                totalHours:
                                    String(
                                        round1(
                                            repairHours
                                        )
                                    ),

                                workedHours:
                                    '0',

                                idleHours:
                                    '0',

                                repairHours:
                                    String(
                                        round1(
                                            repairHours
                                        )
                                    ),

                                fuelReceived:
                                    null,

                                notes:
                                    null,

                                recordedBy:
                                    input.recordedBy ??
                                    null,

                                updatedAt:
                                    new Date()
                                        .toISOString(),
                            })
                            .returning()
                    );

                if (!created) {
                    throw new Error(
                        'Цаг ашиглалтын бүртгэл үүссэнгүй'
                    );
                }

                await tx
                    .insert(
                        equipmentRepairEntries
                    )
                    .values(
                        incomingRepairEntries.map(
                            (entry) => ({
                                shiftLogId:
                                    created.id,

                                repairReasonId:
                                    entry.repairReasonId,

                                mechanicId:
                                    entry.mechanicId,

                                hours:
                                    entry.hours,

                                notes:
                                    entry.notes,
                            })
                        )
                    );

                return {
                    shiftLog:
                        created,

                    repairEntries:
                        incomingRepairEntries,

                    created: true,
                };
            }

            /*
             * =========================================
             * 3. SHIFT БАЙНА
             * =========================================
             *
             * Шинэ shift үүсгэхгүй.
             *
             * Existing parent дээр repair entry
             * шууд нэмнэ.
             */

            await tx
                .insert(
                    equipmentRepairEntries
                )
                .values(
                    incomingRepairEntries.map(
                        (entry) => ({
                            shiftLogId:
                                existingShift.id,

                            repairReasonId:
                                entry.repairReasonId,

                            mechanicId:
                                entry.mechanicId,

                            hours:
                                entry.hours,

                            notes:
                                entry.notes,
                        })
                    )
                );

            /*
             * =========================================
             * 4. REPAIR HOURS ДАХИН БОДНО
             * =========================================
             *
             * equipment_repair_entries бол source.
             *
             * repair_hours нь түүний нийлбэр.
             */

            const [
                repairTotal,
            ] =
                await tx
                    .select({
                        total:
                            sql<string>`
                                COALESCE(
                                    SUM(
                                        ${equipmentRepairEntries.hours}
                                    ),
                                    0
                                )
                            `,
                    })
                    .from(
                        equipmentRepairEntries
                    )
                    .where(
                        eq(
                            equipmentRepairEntries.shiftLogId,
                            existingShift.id
                        )
                    );

            const repairHours =
                round1(
                    toNumber(
                        repairTotal?.total
                    )
                );

            /*
             * =========================================
             * 5. PARENT SHIFT SYNC
             * =========================================
             */

            const updatedShift =
                await firstOrNull(
                    await tx
                        .update(
                            equipmentShiftLogs
                        )
                        .set({
                            repairHours:
                                String(
                                    repairHours
                                ),

                            updatedAt:
                                new Date()
                                    .toISOString(),
                        })
                        .where(
                            and(
                                eq(
                                    equipmentShiftLogs.id,
                                    existingShift.id
                                ),
                                eq(
                                    equipmentShiftLogs.organizationId,
                                    organizationId
                                )
                            )
                        )
                        .returning()
                );

            if (!updatedShift) {
                throw new Error(
                    'Засварын цаг шинэчлэгдсэнгүй'
                );
            }

            return {
                shiftLog:
                    updatedShift,

                repairEntries:
                    incomingRepairEntries,

                created: false,
            };
        }
    );
};

/* =========================================================
 * SHIFT LOG LIST
 * ======================================================= */

export const getShiftLogs = async ({
    organizationId,
    startDate,
    endDate,
    vehicleId,
    limit = 50,
    offset = 0,
}: {
    organizationId: string;
    startDate?: string;
    endDate?: string;
    vehicleId?: string;
    limit?: number;
    offset?: number;
}) => {
    const conditions = [
        eq(
            equipmentShiftLogs.organizationId,
            organizationId
        ),
    ];

    if (startDate) {
        conditions.push(
            gte(
                equipmentShiftLogs.operationalDate,
                startDate
            )
        );
    }

    if (endDate) {
        conditions.push(
            lte(
                equipmentShiftLogs.operationalDate,
                endDate
            )
        );
    }

    if (vehicleId) {
        conditions.push(
            eq(
                equipmentShiftLogs.vehicleId,
                vehicleId
            )
        );
    }

    const operator = drizzleDb
        .select({
            id: users.id,
            name: users.name,
            firstName:
                users.firstName,
            lastName:
                users.lastName,
            role:
                users.role,
        })
        .from(users)
        .as('operator');

    return drizzleDb
        .select({
            ...getTableColumns(
                equipmentShiftLogs
            ),

            vehicle: {
                id: vehicles.id,
                name: vehicles.name,
                mineNumber:
                    vehicles.mineNumber,
                type: vehicles.type,
            },

            operator: {
                id: operator.id,
                name: operator.name,
                firstName:
                    operator.firstName,
                lastName:
                    operator.lastName,
                role:
                    operator.role,
            },

            totalCount:
                sql<number>`
                    count(*) OVER()
                `.as('total_count'),
        })
        .from(equipmentShiftLogs)

        .leftJoin(
            vehicles,
            eq(
                equipmentShiftLogs.vehicleId,
                vehicles.id
            )
        )

        .leftJoin(
            operator,
            eq(
                equipmentShiftLogs.operatorId,
                operator.id
            )
        )

        .where(
            and(...conditions)
        )

        .orderBy(
            desc(
                equipmentShiftLogs.operationalDate
            ),
            desc(
                equipmentShiftLogs.createdAt
            )
        )

        .limit(limit)
        .offset(offset);
};

/* =========================================================
 * SHIFT LOG DETAIL
 * ======================================================= */

export const getShiftLogById = async (
    id: string,
    organizationId: string
) => {
    /*
     * ===================================
     * OPERATOR
     * ===================================
     */
    const operator = drizzleDb
        .select({
            id: users.id,
            name: users.name,
            firstName:
                users.firstName,
            lastName:
                users.lastName,
            role:
                users.role,
        })
        .from(users)
        .as('operator');

    /*
     * ===================================
     * MECHANIC
     * ===================================
     *
     * equipment_repair_entries.mechanic_id
     * -> users.id
     */
    const mechanic = drizzleDb
        .select({
            id: users.id,
            name: users.name,
            firstName:
                users.firstName,
            lastName:
                users.lastName,
            role:
                users.role,
            position:
                users.position,
        })
        .from(users)
        .as('mechanic');

    /*
     * ===================================
     * SHIFT LOG
     * ===================================
     */
    const log = await firstOrNull(
        await drizzleDb
            .select({
                ...getTableColumns(
                    equipmentShiftLogs
                ),

                vehicle: {
                    id:
                        vehicles.id,

                    name:
                        vehicles.name,

                    mineNumber:
                        vehicles.mineNumber,

                    type:
                        vehicles.type,
                },

                operator: {
                    id:
                        operator.id,

                    name:
                        operator.name,

                    firstName:
                        operator.firstName,

                    lastName:
                        operator.lastName,

                    role:
                        operator.role,
                },
            })

            .from(
                equipmentShiftLogs
            )

            .leftJoin(
                vehicles,
                eq(
                    equipmentShiftLogs.vehicleId,
                    vehicles.id
                )
            )

            .leftJoin(
                operator,
                eq(
                    equipmentShiftLogs.operatorId,
                    operator.id
                )
            )

            .where(
                and(
                    eq(
                        equipmentShiftLogs.id,
                        id
                    ),

                    eq(
                        equipmentShiftLogs.organizationId,
                        organizationId
                    )
                )
            )
    );

    if (!log) {
        return null;
    }

    /*
     * ===================================
     * IDLE + REPAIR ENTRIES
     * ===================================
     */
    const [
        idleEntries,
        repairEntries,
    ] = await Promise.all([
        /*
         * ===================================
         * IDLE ENTRIES
         * ===================================
         */
        drizzleDb
            .select({
                ...getTableColumns(
                    equipmentIdleEntries
                ),

                reasonName:
                    idleReasonTypes.name,
            })

            .from(
                equipmentIdleEntries
            )

            .leftJoin(
                idleReasonTypes,
                eq(
                    equipmentIdleEntries.idleReasonId,
                    idleReasonTypes.id
                )
            )

            .where(
                eq(
                    equipmentIdleEntries.shiftLogId,
                    id
                )
            ),

        /*
         * ===================================
         * REPAIR ENTRIES
         * ===================================
         */
        drizzleDb
            .select({
                ...getTableColumns(
                    equipmentRepairEntries
                ),

                reasonName:
                    repairReasonTypes.name,

                mechanic: {
                    id:
                        mechanic.id,

                    name:
                        mechanic.name,

                    firstName:
                        mechanic.firstName,

                    lastName:
                        mechanic.lastName,

                    role:
                        mechanic.role,

                    position:
                        mechanic.position,
                },
            })

            .from(
                equipmentRepairEntries
            )

            .leftJoin(
                repairReasonTypes,
                eq(
                    equipmentRepairEntries.repairReasonId,
                    repairReasonTypes.id
                )
            )

            .leftJoin(
                mechanic,
                eq(
                    equipmentRepairEntries.mechanicId,
                    mechanic.id
                )
            )

            .where(
                eq(
                    equipmentRepairEntries.shiftLogId,
                    id
                )
            ),
    ]);

    /*
     * ===================================
     * RESPONSE
     * ===================================
     */
    return {
        ...log,

        idleEntries,

        repairEntries,
    };
};

/* =========================================================
 * UPDATE SHIFT LOG
 * ======================================================= */

export const updateShiftLog = async (
    id: string,

    organizationId: string,

    input: Partial<
        Pick<
            ShiftLogInsert,
            | 'totalHours'
            | 'workedHours'
            | 'repairHours'
            | 'idleHours'
            | 'fuelReceived'
            | 'notes'
            | 'operatorId'
        >
    >,

    idleEntries?: IdleEntryPayload[],

    repairEntries?: RepairEntryPayload[]
) => {
    return drizzleDb.transaction(
        async (tx) => {
            const current =
                await firstOrNull(
                    await tx
                        .select()
                        .from(
                            equipmentShiftLogs
                        )
                        .where(
                            and(
                                eq(
                                    equipmentShiftLogs.id,
                                    id
                                ),

                                eq(
                                    equipmentShiftLogs.organizationId,
                                    organizationId
                                )
                            )
                        )
                );

            if (!current) {
                throw new Error(
                    'Цаг ашиглалтын бүртгэл олдсонгүй'
                );
            }

            const updatePayload:
                Partial<ShiftLogInsert> = {
                updatedAt:
                    new Date().toISOString(),
            };

            /*
             * Энд юу ч автоматаар бодохгүй.
             *
             * Frontend-аас ямар value ирнэ,
             * тэр value-г хадгална.
             */

            if (
                input.totalHours !==
                undefined
            ) {
                updatePayload.totalHours =
                    String(
                        round1(
                            toNumber(
                                input.totalHours
                            )
                        )
                    );
            }

            if (
                input.workedHours !==
                undefined
            ) {
                updatePayload.workedHours =
                    input.workedHours ===
                        null
                        ? null
                        : String(
                            round1(
                                toNumber(
                                    input.workedHours
                                )
                            )
                        );
            }

            if (
                input.repairHours !==
                undefined
            ) {
                updatePayload.repairHours =
                    input.repairHours ===
                        null
                        ? null
                        : String(
                            round1(
                                toNumber(
                                    input.repairHours
                                )
                            )
                        );
            }

            if (
                input.idleHours !==
                undefined
            ) {
                updatePayload.idleHours =
                    input.idleHours ===
                        null
                        ? null
                        : String(
                            round1(
                                toNumber(
                                    input.idleHours
                                )
                            )
                        );
            }

            if (
                input.fuelReceived !==
                undefined
            ) {
                updatePayload.fuelReceived =
                    input.fuelReceived ===
                        null
                        ? null
                        : String(
                            round1(
                                toNumber(
                                    input.fuelReceived
                                )
                            )
                        );
            }

            if (
                input.notes !== undefined
            ) {
                updatePayload.notes =
                    input.notes ?? null;
            }

            if (
                input.operatorId !==
                undefined
            ) {
                updatePayload.operatorId =
                    input.operatorId ??
                    null;
            }

            const updated =
                await firstOrNull(
                    await tx
                        .update(
                            equipmentShiftLogs
                        )
                        .set(
                            updatePayload
                        )
                        .where(
                            and(
                                eq(
                                    equipmentShiftLogs.id,
                                    id
                                ),

                                eq(
                                    equipmentShiftLogs.organizationId,
                                    organizationId
                                )
                            )
                        )
                        .returning()
                );

            if (!updated) {
                throw new Error(
                    'Цаг ашиглалтын бүртгэл шинэчлэгдсэнгүй'
                );
            }

            /*
             * ===================================
             * IDLE ENTRIES
             * ===================================
             */

            if (
                idleEntries !==
                undefined
            ) {
                await tx
                    .delete(
                        equipmentIdleEntries
                    )
                    .where(
                        eq(
                            equipmentIdleEntries.shiftLogId,
                            id
                        )
                    );

                const entries =
                    normalizeIdleEntries(
                        idleEntries
                    );

                if (
                    entries.length > 0
                ) {
                    await tx
                        .insert(
                            equipmentIdleEntries
                        )
                        .values(
                            entries.map(
                                (
                                    entry
                                ) => ({
                                    shiftLogId:
                                        id,

                                    idleReasonId:
                                        entry.idleReasonId,

                                    hours:
                                        entry.hours,

                                    notes:
                                        entry.notes,
                                })
                            )
                        );
                }
            }

            /*
             * ===================================
             * REPAIR ENTRIES
             * ===================================
             */

            if (
                repairEntries !==
                undefined
            ) {
                await tx
                    .delete(
                        equipmentRepairEntries
                    )
                    .where(
                        eq(
                            equipmentRepairEntries.shiftLogId,
                            id
                        )
                    );

                const entries =
                    normalizeRepairEntries(
                        repairEntries
                    );

                if (
                    entries.length > 0
                ) {
                    await tx
                        .insert(
                            equipmentRepairEntries
                        )
                        .values(
                            entries.map(
                                (entry) => ({
                                    shiftLogId:
                                        id,

                                    repairReasonId:
                                        entry.repairReasonId,

                                    mechanicId:
                                        entry.mechanicId,

                                    hours:
                                        entry.hours,

                                    notes:
                                        entry.notes,
                                })
                            )
                        );
                }
            }

            const final =
                await firstOrNull(
                    await tx
                        .select()
                        .from(
                            equipmentShiftLogs
                        )
                        .where(
                            and(
                                eq(
                                    equipmentShiftLogs.id,
                                    id
                                ),

                                eq(
                                    equipmentShiftLogs.organizationId,
                                    organizationId
                                )
                            )
                        )
                );

            if (!final) {
                throw new Error(
                    'Цаг ашиглалтын бүртгэлийн эцсийн утга олдсонгүй'
                );
            }

            return final;
        }
    );
};

/* =========================================================
 * DELETE SHIFT LOG
 * ======================================================= */

export const deleteShiftLog = async (
    id: string,
    organizationId: string
) => {
    return first(
        await drizzleDb
            .delete(
                equipmentShiftLogs
            )
            .where(
                and(
                    eq(
                        equipmentShiftLogs.id,
                        id
                    ),

                    eq(
                        equipmentShiftLogs.organizationId,
                        organizationId
                    )
                )
            )
            .returning()
    );

};