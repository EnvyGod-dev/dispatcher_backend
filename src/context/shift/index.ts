import { drizzleDb } from '$/libs/database/db';
import {
  inspections,
  shiftInspections,
  shifts,
  users,
  vehicles,
  workLogs,
} from '$/libs/database/schema';
import { first, firstOrNull, type PaginationType } from '$/libs/database/utils';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from 'drizzle-orm';
import { getVehicleByPk } from '../vehicle';
import type { Shift, ShiftStatus, ShiftType } from './types';
import {
  getPendingWorkLogByShiftId,
  getTotalWorkLogCountByShiftId,
  getWorkLogsByShiftId,
} from '../work-log';
import Big from 'big.js';
import { ClientError, NotFound } from '$/utils/errors';
import { HTTPException } from 'hono/http-exception';
import logger from '$/utils/logger';
import type { VehicleType } from '../vehicle/types';
import type { InspectionStatus } from '../inspection';
import { getTotalCountSql } from '../helpers';
import { crewFor } from '$/utils/crew-rotation';
import { resolveLegacyOperationalDate } from '$/utils/operational-date';
import { getFuelByShift } from './work-summary';

export const getShiftByPk = async (id: string) => {
  return firstOrNull(
    await drizzleDb.select().from(shifts).where(eq(shifts.id, id)),
  );
};

export const getShifts = async (
  { limit, offset }: PaginationType,
  {
    organizationId,
    driverId,
    vehicleId,
    status,
  }: {
    organizationId: string;
    driverId?: string;
    vehicleId?: string;
    status?: ShiftStatus;
  },
) => {
  return drizzleDb
    .select({
      ...getTableColumns(shifts),
      workLogs: getTableColumns(workLogs),
      vehicle: {
        name: vehicles.name,
        code: vehicles.code,
        vehicleNumber: vehicles.vehicleNumber,
      },
    })
    .from(shifts)
    .leftJoin(users, eq(users.id, shifts.driverId))
    .leftJoin(workLogs, eq(workLogs.shiftId, shifts.id))
    .leftJoin(
      vehicles,
      and(eq(shifts.vehicleId, vehicles.id), isNull(vehicles.deletedAt)),
    )
    .where(
      and(
        eq(users.organizationId, organizationId),
        driverId ? eq(shifts.driverId, driverId) : undefined,
        vehicleId ? eq(shifts.vehicleId, vehicleId) : undefined,
        status ? eq(shifts.status, status) : undefined,
      ),
    )
    .limit(limit)
    .offset(offset);
};

// integer
export const getStartedShift = async ({
  driverId,
  status,
}: {
  driverId: string;
  status: ShiftStatus;
}) => {
  const shift = await drizzleDb.query.shifts.findFirst({
    with: {
      shiftInspections: true,
    },
    where: and(eq(shifts.driverId, driverId), eq(shifts.status, status)),
  });

  if (!shift) {
    return;
  }

  const vehicle = await getVehicleByPk(shift.vehicleId);
  const workLogList = await getWorkLogsByShiftId(shift.id);

  return {
    ...shift,
    workLogs: workLogList,
    vehicle,
  };
};

export const getActiveShiftByVehicleId = async (vehicleId: string) => {
  return firstOrNull(
    await drizzleDb
      .select()
      .from(shifts)
      .where(
        and(eq(shifts.vehicleId, vehicleId), eq(shifts.status, 'started')),
      ),
  );
};

export const getShiftHistory = async (
  {
    driverId,
    status,
  }: {
    driverId: string;
    status?: ShiftStatus;
  },
  { limit, offset }: PaginationType,
) => {
  const rows = await drizzleDb.query.shifts.findMany({
    with: {
      shiftInspections: {
        with: {
          inspection: true,
        },
      },
      vehicle: {
        with: {
          vehicleOrganization: true,
          miningSection: true,
          vehiclePictures: true,
        },
      },
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
      eq(shifts.driverId, driverId),
      status ? eq(shifts.status, status) : undefined,
    ),
    orderBy: desc(shifts.createdAt),
    limit,
    offset,
  });

  const organizationId = rows[0]?.organizationId;
  const fuel = organizationId ? await getFuelByShift(organizationId, rows) : new Map();

  // Тухайн ээлжид техник хэдэн литр түлш авсан.
  return rows.map((row) => ({
    ...row,
    fuelLiters: fuel.get(row.id)?.liters ?? 0,
    refuelings: fuel.get(row.id)?.items ?? [],
  }));
};

export const getShiftCount = async ({
  organizationId,
  driverId,
  vehicleId,
  status,
}: {
  organizationId: string;
  driverId?: string;
  vehicleId?: string;
  status?: ShiftStatus;
}) => {
  const query = firstOrNull(
    await drizzleDb
      .select({
        count: count(),
      })
      .from(shifts)
      .leftJoin(users, eq(users.id, shifts.driverId))
      .leftJoin(workLogs, eq(workLogs.shiftId, shifts.id))
      .leftJoin(
        vehicles,
        and(eq(shifts.vehicleId, vehicles.id), isNull(vehicles.deletedAt)),
      )
      .where(
        and(
          eq(users.organizationId, organizationId),
          driverId ? eq(shifts.driverId, driverId) : undefined,
          vehicleId ? eq(shifts.vehicleId, vehicleId) : undefined,
          status ? eq(shifts.status, status) : undefined,
        ),
      ),
  );

  return query ? query.count : 0;
};

type ShiftInsert = typeof shifts.$inferInsert;

export type StartShiftInspectionInput = {
  inspectionId: string;
  status: InspectionStatus;
  notes?: string;
  photoUrl?: string;
};

/**
 * Ээлж эхлүүлнэ. inspections ирвэл тойрох үзлэгийг ээлжтэй нэг transaction-д хадгална.
 */
export const startShift = async (
  input: ShiftInsert,
  inspectionResults: StartShiftInspectionInput[] = [],
) => {
  const shiftType = input.shiftType ?? 'day';
  const operationalDate =
    input.operationalDate ?? resolveLegacyOperationalDate({ shiftType });

  const driver = await firstOrNull(
    await drizzleDb
      .select({
        role: users.role,
        driverShiftGroup: users.driverShiftGroup,
      })
      .from(users)
      .where(eq(users.id, input.driverId)),
  );

  if (!driver) {
    throw new NotFound('Оператор олдсонгүй.');
  }

  // if (driver.role === 'driver' && !driver.driverShiftGroup) {
  //   throw new ClientError('Операторт ABCD ээлж тохируулаагүй байна.');
  // }

  return drizzleDb.transaction(async (tx) => {
    const shift = first(
      await tx
        .insert(shifts)
        .values({
          ...input,
          // Ээлжийг (А/Б/В/Г) огноо ба ээлжийн төрлөөс автоматаар тодорхойлно.
          driverShiftGroup: crewFor(operationalDate, shiftType) ?? driver.driverShiftGroup,
          shiftType,
          operationalDate,
          status: 'started',
        })
        .returning(),
    );

    if (inspectionResults.length > 0) {
      await tx.insert(shiftInspections).values(
        inspectionResults.map((inspection) => ({
          shiftId: shift.id,
          vehicleId: shift.vehicleId,
          driverId: shift.driverId,
          inspectionId: inspection.inspectionId,
          status: inspection.status,
          notes: inspection.notes,
          photoUrl: inspection.photoUrl,
        })),
      );
    }

    return shift;
  });
};

/**
 * Техникийн хамгийн сүүлийн ээлж (оператор техник сонгоход мото цаг, км-ийг санал болгоно).
 */
export const getLastShiftByVehicle = async (vehicleId: string, organizationId: string) => {
  return firstOrNull(
    await drizzleDb
      .select({
        id: shifts.id,
        status: shifts.status,
        shiftType: shifts.shiftType,
        operationalDate: shifts.operationalDate,
        shiftStart: shifts.shiftStart,
        shiftEnd: shifts.shiftEnd,
        motoStart: shifts.motoStart,
        motoEnd: shifts.motoEnd,
        mileageStart: shifts.mileageStart,
        mileageEnd: shifts.mileageEnd,
        driverId: shifts.driverId,
        driverFirstName: users.firstName,
        driverLastName: users.lastName,
      })
      .from(shifts)
      .leftJoin(users, eq(users.id, shifts.driverId))
      .where(and(eq(shifts.vehicleId, vehicleId), eq(shifts.organizationId, organizationId)))
      .orderBy(desc(shifts.createdAt))
      .limit(1),
  );
};

const toReading = (value: string | null | undefined) => {
  if (value === null || value === undefined || value.trim() === '') {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
};

/**
 * Өмнөх (хамгийн сүүлийн, дууссан) ээлжийн төгсгөлийн мото цаг, км-ийг оператор шууд засна.
 * Хүсэлт үүсгэхгүй. Зөвхөн тухайн техникийн хамгийн сүүлийн ээлжид зөвшөөрнө.
 */
export const correctLastShiftReadings = async (input: {
  vehicleId: string;
  organizationId: string;
  shiftId: string;
  motoEnd?: string;
  mileageEnd?: string;
}) => {
  const last = await getLastShiftByVehicle(input.vehicleId, input.organizationId);

  if (!last || last.id !== input.shiftId) {
    throw new ClientError('Зөвхөн тухайн техникийн хамгийн сүүлийн ээлжийг засах боломжтой.');
  }

  if (last.status !== 'completed') {
    throw new ClientError('Дуусаагүй ээлжийн заалтыг засах боломжгүй.');
  }

  const motoEnd = input.motoEnd ?? last.motoEnd ?? undefined;
  const mileageEnd = input.mileageEnd ?? last.mileageEnd ?? undefined;
  const motoStartN = toReading(last.motoStart);
  const motoEndN = toReading(motoEnd);
  const mileageStartN = toReading(last.mileageStart);
  const mileageEndN = toReading(mileageEnd);

  if (motoStartN !== null && motoEndN !== null && motoEndN < motoStartN) {
    throw new ClientError(`Мото цаг ээлжийн эхлэлийн заалтаас (${last.motoStart}) бага байна.`);
  }

  if (mileageStartN !== null && mileageEndN !== null && mileageEndN < mileageStartN) {
    throw new ClientError(`Км ээлжийн эхлэлийн заалтаас (${last.mileageStart}) бага байна.`);
  }

  return first(
    await drizzleDb
      .update(shifts)
      .set({
        ...(input.motoEnd !== undefined && { motoEnd: input.motoEnd }),
        ...(input.mileageEnd !== undefined && { mileageEnd: input.mileageEnd }),
      })
      .where(eq(shifts.id, last.id))
      .returning(),
  );
};

type EndFinishInput = {
  shift: typeof shifts.$inferSelect;
  mileageEnd: string;
  motoEnd: string;
  notes?: string;
};

export const calculateShiftProducts = async (shift: Shift) => {
  const totalWorks = await getTotalWorkLogCountByShiftId({
    shiftId: shift.id,
  });

  const vehicle = await getVehicleByPk(shift.vehicleId);

  if (!vehicle) {
    throw new NotFound('Техник олдсонгүй.');
  }

  const soilProduct = Big(totalWorks.soilCount)
    .mul(vehicle?.soilCoefficient ?? 0)
    .toString();

  const coalProduct = Big(totalWorks.coalCount)
    .mul(vehicle?.coalCoefficient ?? 0)
    .toString();

  return {
    soilProduct,
    coalProduct,
  };
};

export const endShift = async (input: EndFinishInput) => {
  const existingWorkLog = await getPendingWorkLogByShiftId(input.shift.id);

  if (existingWorkLog.length > 0) {
    throw new ClientError('Дуусгаагүй рэйс байна.');
  }

  const totalWorks = await getTotalWorkLogCountByShiftId({
    shiftId: input.shift.id,
  });

  const vehicle = await getVehicleByPk(input.shift.vehicleId);

  if (!vehicle) {
    throw new NotFound('Техник олдсонгүй.');
  }

  const soilProduct = Big(totalWorks.soilCount)
    .mul(vehicle?.soilCoefficient ?? 0)
    .toString();

  const coalProduct = Big(totalWorks.coalCount)
    .mul(vehicle?.coalCoefficient ?? 0)
    .toString();

  return first(
    await drizzleDb
      .update(shifts)
      .set({
        ...input,
        status: 'completed',
        shiftEnd: new Date().toISOString(),
        soilProduct,
        coalProduct,
      })
      .where(eq(shifts.id, input.shift.id))
      .returning(),
  );
};

export type UpdateShiftInput = {
  id: string;
  vehicleId?: string;
  driverShiftGroup?: 'A' | 'B' | 'C' | 'D';
  shiftType?: ShiftType;
  operationalDate?: string;
  mileageStart?: string;
  mileageEnd?: string;
  motoStart?: string;
  motoEnd?: string;
  status?: ShiftStatus;
};

export const updateShift = async (input: UpdateShiftInput) => {
  const existingShift = await getShiftByPk(input.id);

  if (!existingShift) {
    throw new NotFound();
  }

  // Диспетчер гараар сонгосон ээлжийг л операторын профайлд хадгална.
  const explicitCrew = input.driverShiftGroup;

  // Огноо эсвэл ээлжийн төрөл өөрчлөгдвөл ээлжийг (А/Б/В/Г) дахин тооцно.
  if (!explicitCrew && (input.shiftType || input.operationalDate)) {
    const crew = crewFor(
      input.operationalDate ?? existingShift.operationalDate,
      input.shiftType ?? existingShift.shiftType,
    );

    if (crew) {
      input = { ...input, driverShiftGroup: crew };
    }
  }

  // if dispatcher finishes shift or update the vehicle, need to calculate products
  if (
    input.status === 'completed' ||
    input.status === 'cancelled' ||
    input.vehicleId !== existingShift.vehicleId
  ) {
    const { soilProduct, coalProduct } =
      await calculateShiftProducts(existingShift);

    const { shift, updatedWorkLogs } = await drizzleDb.transaction(async (tx) => {
      const [updatedShift] = await tx
        .update(shifts)
        .set({ ...input, soilProduct, coalProduct })
        .where(eq(shifts.id, existingShift.id))
        .returning();

      if (explicitCrew) {
        await tx
          .update(users)
          .set({ driverShiftGroup: explicitCrew })
          .where(eq(users.id, existingShift.driverId));
      }

      const completedWorkLogs = await tx
        .update(workLogs)
        .set({ status: 'completed' })
        .where(
          and(
            eq(workLogs.shiftId, existingShift.id),
            eq(workLogs.status, 'in_progress'),
          ),
        );

      return {
        shift: updatedShift,
        updatedWorkLogs: completedWorkLogs,
      };
    });

    console.log(updatedWorkLogs, 'worklogs updated');

    return shift;
  }

  const shift = await drizzleDb.transaction(async (tx) => {
    const [updatedShift] = await tx
      .update(shifts)
      .set(input)
      .where(eq(shifts.id, existingShift.id))
      .returning();

    if (explicitCrew) {
      await tx
        .update(users)
        .set({ driverShiftGroup: explicitCrew })
        .where(eq(users.id, existingShift.driverId));
    }

    return updatedShift;
  });

  return shift;
};

export const deleteShift = async (id: string) => {
  const existing = await getShiftByPk(id);

  if (!existing) {
    throw new HTTPException(422, { message: 'Ээлж олдсонгүй.' });
  }

  const deleted = await drizzleDb.transaction(async (tx) => {
    const deletedVehicleInspection = await tx
      .delete(shiftInspections)
      .where(eq(shiftInspections.shiftId, existing.id))
      .returning();

    const deletedWorkLogs = await tx
      .delete(workLogs)
      .where(eq(workLogs.shiftId, existing.id))
      .returning();

    const deletedShift = await tx
      .delete(shifts)
      .where(eq(shifts.id, id))
      .returning();

    return {
      deletedVehicleInspection,
      deletedWorkLogs,
      deletedShift,
    };
  });

  logger.info({
    event: 'delete-shift',
    msg: 'shift and its related worklog and inspections are deleted',
    data: { deleted },
  });

  return deleted.deletedShift;
};

export const getDriverShiftsWithWorkLogs = async (
  { limit, offset }: PaginationType,
  driverId: string,
  organizationId: string,
) => {
  return drizzleDb.query.shifts.findMany({
    with: {
      vehicle: {
        with: {
          vehicleOrganization: true,
        },
      },
      workLogs: {
        with: {
          stockpile: true,
          dailyPlan: {
            with: {
              miningBlock: true,
              route: true,
            },
          },
        },
        orderBy: desc(workLogs.createdAt),
      },
      shiftInspections: {
        with: {
          inspection: true,
        },
      },
    },
    where: and(
      eq(shifts.driverId, driverId),
      eq(shifts.organizationId, organizationId),
    ),
    orderBy: desc(shifts.createdAt),
    limit: limit,
    offset: offset,
  });
};

type ShiftInspectionFilter = {
  organizationId: string;
  vehicleType?: VehicleType;
  status?: InspectionStatus;
  vehicleId?: string;
};

export const getShiftInspections = async (
  { limit, offset }: PaginationType,
  { organizationId, vehicleType, status, vehicleId }: ShiftInspectionFilter,
) => {
  return drizzleDb
    .select({
      ...getTableColumns(shiftInspections),
      totalCount: getTotalCountSql,
      inspection: getTableColumns(inspections),
      user: getTableColumns(users),
      vehicle: getTableColumns(vehicles),
      shift: getTableColumns(shifts),
    })
    .from(shiftInspections)
    .leftJoin(inspections, eq(inspections.id, shiftInspections.inspectionId))
    .leftJoin(users, eq(users.id, shiftInspections.driverId))
    .leftJoin(
      vehicles,
      and(
        eq(vehicles.id, shiftInspections.vehicleId),
        isNull(vehicles.deletedAt),
      ),
    )
    .leftJoin(shifts, eq(shifts.id, shiftInspections.shiftId))
    .where(
      and(
        eq(inspections.organizationId, organizationId),
        isNull(vehicles.deletedAt),
        vehicleType ? eq(inspections.vehicleType, vehicleType) : undefined,
        status ? eq(shiftInspections.status, status) : undefined,
        vehicleId ? eq(shiftInspections.vehicleId, vehicleId) : undefined,
      ),
    )
    .limit(limit)
    .offset(offset)
    .orderBy(desc(shiftInspections.createdAt));
};

export const getVehicleInspectionsByShift = async (
  { limit, offset }: PaginationType,
  {
    vehicleId,
    organizationId,
    status,
  }: { vehicleId: string; organizationId: string; status?: InspectionStatus },
) => {
  // Get shifts for this vehicle with inspection aggregations
  const shiftsWithInspections = await drizzleDb
    .select({
      // Shift info
      shiftId: shifts.id,
      shiftStart: shifts.shiftStart,
      shiftEnd: shifts.shiftEnd,
      shiftType: shifts.shiftType,
      shiftStatus: shifts.status,

      // Driver info
      driverId: users.id,
      driverName: users.name,
      driverFirstName: users.firstName,
      driverLastName: users.lastName,

      // Vehicle info
      vehicleId: vehicles.id,
      vehicleCode: vehicles.code,
      vehicleName: vehicles.name,
      vehicleType: vehicles.type,

      // Aggregated inspection counts
      totalInspections: sql<number>`COUNT(${shiftInspections.id})::int`,
      normalCount: sql<number>`
        COUNT(CASE WHEN ${shiftInspections.status} = 'normal' THEN 1 END)::int
      `,
      issueCount: sql<number>`
        COUNT(CASE WHEN ${shiftInspections.status} = 'issue' THEN 1 END)::int
      `,
      needsInspectionCount: sql<number>`
        COUNT(CASE WHEN ${shiftInspections.status} = 'needs_inspection' THEN 1 END)::int
      `,

      // Total count for pagination
      totalCount: sql<number>`COUNT(*) OVER()::int`,
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.driverId))
    .innerJoin(
      vehicles,
      and(eq(vehicles.id, shifts.vehicleId), isNull(vehicles.deletedAt)),
    )
    .leftJoin(shiftInspections, eq(shiftInspections.shiftId, shifts.id))
    .where(
      and(
        eq(shifts.vehicleId, vehicleId),
        eq(vehicles.organizationId, organizationId),
        status ? eq(shiftInspections.status, status) : undefined,
      ),
    )
    .groupBy(
      shifts.id,
      shifts.shiftStart,
      shifts.shiftEnd,
      shifts.shiftType,
      shifts.status,
      users.id,
      users.name,
      users.firstName,
      users.lastName,
      vehicles.id,
      vehicles.code,
      vehicles.name,
      vehicles.type,
    )
    .having(sql`COUNT(${shiftInspections.id}) > 0`) // only shifts with inspections
    .orderBy(desc(shifts.shiftStart))
    .limit(limit)
    .offset(offset);

  const shiftIds = shiftsWithInspections.map((s) => s.shiftId);

  const detailedInspections =
    shiftIds.length > 0
      ? await drizzleDb
          .select({
            shiftId: shiftInspections.shiftId,
            inspectionId: shiftInspections.id,
            status: shiftInspections.status,
            notes: shiftInspections.notes,
            photoUrl: shiftInspections.photoUrl,
            createdAt: shiftInspections.createdAt,

            inspectionType: inspections.type,
            inspectionName: inspections.name,
          })
          .from(shiftInspections)
          .innerJoin(
            inspections,
            eq(inspections.id, shiftInspections.inspectionId),
          )
          .where(inArray(shiftInspections.shiftId, shiftIds))
          .orderBy(inspections.type, inspections.name)
      : [];

  // Group inspections by shift and type
  const inspectionsByShift = detailedInspections.reduce(
    (acc, inspection) => {
      const shiftKey = inspection.shiftId as string;
      const shiftInspections = (acc[shiftKey] ??= {});

      const type = inspection.inspectionType || 'Бусад';
      const inspectionsForType = (shiftInspections[type] ??= []);
      inspectionsForType.push(inspection);
      return acc;
    },
    {} as Record<string, Record<string, any[]>>,
  );

  // Combine shift data with inspections
  return shiftsWithInspections.map((shift) => ({
    ...shift,
    inspectionsByType: inspectionsByShift[shift.shiftId] || {},
  }));
};
export const getVehicleInspectionSummary = async (
  { limit, offset }: PaginationType,
  {
    organizationId,
    startDate,
    endDate,
    vehicleType,
    vehicleOrganizationId,
    vehicleId,
    shiftType,
    driverId,
  }: {
    organizationId: string;
    startDate?: string;
    endDate?: string;
    vehicleType?: VehicleType;
    vehicleOrganizationId?: string;
    vehicleId?: string;
    shiftType?: ShiftType;
    driverId?: string;
  },
) => {
  return drizzleDb
    .select({
      vehicleId: vehicles.id,
      vehicleCode: vehicles.code,
      vehicleName: vehicles.name,
      vehicleType: vehicles.type,
      vehicleStatus: vehicles.status,
      totalInspections: sql<number>`COUNT(DISTINCT ${shiftInspections.id})::int`,
      normalCount: sql<number>`
        COUNT(DISTINCT CASE WHEN ${shiftInspections.status} = 'normal' THEN ${shiftInspections.id} END)::int
      `,
      issueCount: sql<number>`
        COUNT(DISTINCT CASE WHEN ${shiftInspections.status} = 'issue' THEN ${shiftInspections.id} END)::int
      `,
      needsInspectionCount: sql<number>`
        COUNT(DISTINCT CASE WHEN ${shiftInspections.status} = 'needs_inspection' THEN ${shiftInspections.id} END)::int
      `,
      lastInspectionDate: sql<string>`
        MAX(${shiftInspections.createdAt})
      `,
      shiftsWithoutInspection: sql<number>`
        COUNT(DISTINCT ${shifts.id}) FILTER (WHERE ${shiftInspections.id} IS NULL)
      `.as('shiftsWithoutInspection'),
    })
    .from(vehicles)
    .leftJoin(
      shifts,
      and(
        eq(shifts.vehicleId, vehicles.id),
        startDate ? gte(shifts.createdAt, startDate) : undefined,
        endDate ? lte(shifts.createdAt, endDate) : undefined,
        shiftType ? eq(shifts.shiftType, shiftType) : undefined,
        driverId ? eq(shifts.driverId, driverId) : undefined,
      ),
    )
    .leftJoin(
      shiftInspections,
      and(
        eq(shiftInspections.shiftId, shifts.id),
        driverId ? eq(shiftInspections.driverId, driverId) : undefined,
      ),
    )
    .where(
        and(
          eq(vehicles.organizationId, organizationId),
          isNull(vehicles.deletedAt),
          vehicleType ? eq(vehicles.type, vehicleType) : undefined,
          vehicleOrganizationId
            ? eq(vehicles.vehicleOrganizationId, vehicleOrganizationId)
            : undefined,
          vehicleId ? eq(vehicles.id, vehicleId) : undefined,
          driverId
            ? exists(
              drizzleDb
                .select({ id: shifts.id })
                .from(shifts)
                .where(
                  and(
                    eq(shifts.vehicleId, vehicles.id),
                    eq(shifts.driverId, driverId),
                  ),
                ),
            )
          : undefined,
      ),
    )
    .groupBy(vehicles.id, vehicles.code, vehicles.name, vehicles.type)
    .orderBy(asc(vehicles.code))
    .limit(limit)
    .offset(offset);
};

export const getVehicleInspectionSummaryCount = async ({
  organizationId,
  startDate,
  endDate,
  vehicleType,
  vehicleOrganizationId,
  vehicleId,
  shiftType,
  driverId,
}: {
  organizationId: string;
  startDate?: string;
  endDate?: string;
  vehicleType?: VehicleType;
  vehicleOrganizationId?: string;
  vehicleId?: string;
  shiftType?: ShiftType;
  driverId?: string;
}) => {
  const result = await drizzleDb
    .select({
      count: sql<number>`COUNT(DISTINCT ${vehicles.id})::int`,
    })
    .from(vehicles)
    .leftJoin(shiftInspections, eq(shiftInspections.vehicleId, vehicles.id))
    .leftJoin(shifts, eq(shifts.id, shiftInspections.shiftId))
    .where(
      and(
        eq(vehicles.organizationId, organizationId),
        isNull(vehicles.deletedAt),
        startDate ? sql`${shifts.createdAt} >= ${startDate}` : undefined,
        endDate ? sql`${shifts.createdAt} <= ${endDate}` : undefined,
        vehicleType ? eq(vehicles.type, vehicleType) : undefined,
        vehicleOrganizationId
          ? eq(vehicles.vehicleOrganizationId, vehicleOrganizationId)
          : undefined,
        vehicleId ? eq(vehicles.id, vehicleId) : undefined,
        shiftType ? eq(shifts.shiftType, shiftType) : undefined,
        driverId ? eq(shifts.driverId, driverId) : undefined,
      ),
    );

  return result[0]?.count || 0;
};
