import { drizzleDb } from '$/libs/database/db';
import {
  dailyPlans,
  enumVehicleType,
  miningBlocks,
  shifts,
  stockpiles,
  vehicles,
  workLogs,
} from '$/libs/database/schema';
import { first, firstOrNull } from '$/libs/database/utils';
import logger from '$/utils/logger';
import { and, desc, eq, getTableColumns, isNull, ne, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { getShiftByPk } from '../shift';
import { ClientError, NotFound } from '$/utils/errors';
import { getVehicleByPk } from '../vehicle';
import { normalizeOperationalDate } from '$/utils/operational-date';

export type WorkLog = typeof workLogs.$inferSelect;

export type StartWorkLogInput = typeof workLogs.$inferInsert;

const getShiftProductTotalsWithDb = async (
  db: typeof drizzleDb,
  shiftId: string
) => {
  const result = await db
    .select({
      soilCount: sql<number>`count(*) filter (where ${stockpiles.type} = 'soil')`,
      coalCount: sql<number>`count(*) filter (where ${stockpiles.type} = 'coal')`,
    })
    .from(workLogs)
    .leftJoin(stockpiles, eq(stockpiles.id, workLogs.stockpileId))
    .where(
      and(ne(workLogs.status, 'cancelled'), eq(workLogs.shiftId, shiftId))
    );

  return {
    soilCount: result[0]?.soilCount ?? 0,
    coalCount: result[0]?.coalCount ?? 0,
  };
};

const recalculateShiftProducts = async (
  db: typeof drizzleDb,
  shift: Awaited<ReturnType<typeof getShiftByPk>>
) => {
  if (!shift) {
    throw new NotFound('Ээлжийн мэдээлэл олдсонгүй.');
  }

  const vehicle = await getVehicleByPk(shift.vehicleId);
  const totalWorks = await getShiftProductTotalsWithDb(db, shift.id);

  const soilProduct = `${
    Number(totalWorks.soilCount) * Number(vehicle?.soilCoefficient ?? 0)
  }`;
  const coalProduct = `${
    Number(totalWorks.coalCount) * Number(vehicle?.coalCoefficient ?? 0)
  }`;

  await db
    .update(shifts)
    .set({
      soilProduct,
      coalProduct,
    })
    .where(eq(shifts.id, shift.id));

  return {
    soilProduct: `${
      Number(totalWorks.soilCount) * Number(vehicle?.soilCoefficient ?? 0)
    }`,
    coalProduct: `${
      Number(totalWorks.coalCount) * Number(vehicle?.coalCoefficient ?? 0)
    }`,
  };
};

type StartWorkLogPayload = {
  shiftId: string;
  planId: string;
  stockpileId: string;
  notes?: string;
};

export const startWorkLog = async (input: StartWorkLogInput) => {
  return first(
    await drizzleDb
      .insert(workLogs)
      .values({ ...input, startTime: new Date().toISOString() })
      .returning()
  );
};

export const startWorkLogV2 = async ({
  input,
  organizationId,
  userId,
}: {
  input: StartWorkLogPayload;
  organizationId: string;
  userId: string;
}) => {
  const started = await getStartedWorkLog(userId);

  if (started !== null) {
    console.log(started, 'started');

    throw new ClientError(
      'Дуусгаагүй рэйсээ дуусгасны дараа шинээр рэйс эхлүүлнэ үү.'
    );
  }

  const { shift, plan } = await validateWorkLogPayload({
    organizationId,
    input,
  });

  if (shift.driverId !== userId) {
    throw new ClientError('Энэ ээлжид рэйс эхлүүлэх боломжгүй байна.');
  }

  if (shift.status !== 'started') {
    throw new ClientError('Ажлын ээлж дууссан байна.');
  }

  if (!shift.operationalDate) {
    throw new ClientError('Ээлжийн огноо сонгоогүй байна.');
  }

  if (
    plan.date !==
    normalizeOperationalDate(shift.operationalDate ?? shift.shiftStart)
  ) {
    throw new ClientError(
      `Сонгосон төлөвлөгөөний огноо (${
        plan.date
      }) нь ээлжийн огноо (${normalizeOperationalDate(
        shift.operationalDate
      )})-той таарахгүй байна. Ижил огноотой төлөвлөгөө сонгоно уу.`
    );
  }

  return startWorkLog(input);
};

export type EndWorkLogInput = {
  userId: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
};

export const endWorkLog = async (input: EndWorkLogInput) => {
  const started = await getStartedWorkLog(input.userId);

  if (started === null) {
    throw new ClientError('Идэвхтэй рэйс байхгүй байна.');
  }

  const shift = await getShiftByPk(started.shiftId);

  if (!shift) {
    throw new ClientError('Ээлжийн мэдээлэл олдсонгүй.');
  }

  const updated = await drizzleDb.transaction(async (tx) => {
    const workLog = first(
      await tx
        .update(workLogs)
        .set({
          ...input,
          endTime: new Date().toISOString(),
        })
        .where(eq(workLogs.id, started.id))
        .returning()
    );

    const updatedShift = await recalculateShiftProducts(
      tx as typeof drizzleDb,
      shift
    );

    logger.info({
      event: 'end-worklog',
      data: {
        updatedShift,
        workLogs,
      },
    });
    return workLog;
  });

  return updated;
};

export type UpdateWorkLogInput = {
  id: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  planId?: string;
  status?: 'in_progress' | 'completed' | 'cancelled';
  stockpileId?: string;
};

export type CreateWorkLogInput = {
  shiftId: string;
  planId: string;
  stockpileId: string;
  startTime: string;
  endTime: string;
  notes?: string;
  status: 'in_progress' | 'completed' | 'cancelled';
};

const allowedShiftVehicleTypes: Array<
  (typeof enumVehicleType.enumValues)[number]
> = ['truck'];

const allowedPlanVehicleTypes: Array<
  (typeof enumVehicleType.enumValues)[number]
> = ['excavator'];

const formatShiftTypeMn = (
  shiftType: (typeof shifts.$inferSelect)['shiftType']
) => {
  return shiftType === 'day' ? 'Өдрийн' : 'Шөнийн';
};

export const validateWorkLogPayload = async ({
  organizationId,
  input,
}: {
  organizationId: string;
  input: Pick<CreateWorkLogInput, 'shiftId' | 'planId' | 'stockpileId'>;
}) => {
  const shift = await getShiftByPk(input.shiftId);

  if (!shift) {
    throw new NotFound('Ээлжийн мэдээлэл олдсонгүй.');
  }

  if (shift.organizationId !== organizationId) {
    throw new ClientError('Энэ ээлжид хандах эрхгүй байна.');
  }

  const vehicle = await getVehicleByPk(shift.vehicleId);

  if (!vehicle) {
    throw new NotFound('Техник олдсонгүй.');
  }

  if (!vehicle.type || !allowedShiftVehicleTypes.includes(vehicle.type)) {
    throw new ClientError('Рэйс зөвхөн автосамосвал ээлж дээр бүртгэгдэнэ.');
  }

  const plan = await firstOrNull(
    await drizzleDb
      .select()
      .from(dailyPlans)
      .where(eq(dailyPlans.id, input.planId))
  );

  if (!plan) {
    throw new NotFound('Өдрийн төлөвлөгөө олдсонгүй.');
  }

  if (plan.organizationId !== organizationId) {
    throw new ClientError('Энэ төлөвлөгөөг ашиглах боломжгүй байна.');
  }

  if (plan.status === 'completed') {
    throw new ClientError(
      'Сонгосон өдрийн төлөвлөгөөг дуусгасан байна. Төлөвлөгөөг дахин шинэчилж, шинээр үүсгэсэн төлөвлөгөөг ашиглана уу.'
    );
  }

  const planVehicle = await getVehicleByPk(plan.vehicleId);

  if (!planVehicle) {
    throw new NotFound('Өдрийн төлөвлөгөөний ачих техник олдсонгүй.');
  }

  if (
    !planVehicle.type ||
    !allowedPlanVehicleTypes.includes(planVehicle.type)
  ) {
    throw new ClientError(
      'Өдрийн төлөвлөгөө нь экскаватортой холбогдсон байх ёстой.'
    );
  }

  if (plan.shiftType !== shift.shiftType) {
    throw new ClientError(
      `Сонгосон төлөвлөгөө нь ${formatShiftTypeMn(
        plan.shiftType
      )} төлөвлөгөө боловч энэ рэйс ${formatShiftTypeMn(
        shift.shiftType
      )} ээлжид бүртгэгдсэн байна. Ижил ээлжийн төрөлтэй төлөвлөгөө сонгоно уу.`
    );
  }

  if (!plan.stockpileIds.includes(input.stockpileId)) {
    throw new ClientError('Сонгосон овоолго энэ төлөвлөгөөнд байхгүй байна.');
  }

  return { shift, plan, vehicle, planVehicle };
};

export const createWorkLog = async (
  input: CreateWorkLogInput,
  organizationId: string
) => {
  const startTime = new Date(input.startTime);
  const endTime = new Date(input.endTime);

  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new ClientError('Рэйсийн цаг буруу байна.');
  }

  if (startTime > endTime) {
    throw new ClientError('Эхлэх цаг дуусах цагаас их байж болохгүй.');
  }

  const { shift } = await validateWorkLogPayload({
    organizationId,
    input,
  });

  const createdWorklog = await drizzleDb.transaction(async (tx) => {
    const created = first(
      await tx
        .insert(workLogs)
        .values({
          ...input,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        })
        .returning()
    );

    const updatedShift = await recalculateShiftProducts(
      tx as typeof drizzleDb,
      shift
    );

    logger.info({
      event: 'create-worklog',
      data: {
        createdWorklog: created,
        updatedShift,
      },
    });

    return created;
  });

  return createdWorklog;
};

export const updateWorkLog = async (input: UpdateWorkLogInput) => {
  const existingWorklog = await getWorkLogByPk(input.id);

  if (!existingWorklog) {
    throw new HTTPException(422, {
      message: 'Work log not found',
    });
  }

  if (input.planId || input.stockpileId) {
    const shift = await getShiftByPk(existingWorklog.shiftId);

    if (!shift) {
      throw new NotFound('Ээлжийн мэдээлэл олдсонгүй.');
    }

    await validateWorkLogPayload({
      organizationId: shift.organizationId,
      input: {
        shiftId: existingWorklog.shiftId,
        planId: input.planId ?? existingWorklog.planId ?? '',
        stockpileId: input.stockpileId ?? existingWorklog.stockpileId ?? '',
      },
    });
  }

  if (input.startTime && input.endTime) {
    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);

    if (startTime > endTime) {
      throw new ClientError('Эхлэх цаг дуусах цагаас их байж болохгүй.');
    }
  }

  const shift = await getShiftByPk(existingWorklog.shiftId);

  const workLog = await drizzleDb.transaction(async (tx) => {
    const [updatedWorkLog] = await tx
      .update(workLogs)
      .set(input)
      .where(eq(workLogs.id, input.id))
      .returning();

    const updatedShift = await recalculateShiftProducts(
      tx as typeof drizzleDb,
      shift
    );

    logger.info({
      event: 'update-worklog',
      data: {
        updatedShift,
        workLog: updatedWorkLog,
      },
    });

    return updatedWorkLog;
  });

  return workLog;
};

export const getWorkLogByPk = async (id: string) => {
  return firstOrNull(
    await drizzleDb.select().from(workLogs).where(eq(workLogs.id, id))
  );
};

export const getStartedWorkLog = async (driverId: string) => {
  return firstOrNull(
    await drizzleDb
      .select({
        ...getTableColumns(workLogs),
      })
      .from(workLogs)
      .leftJoin(shifts, eq(shifts.id, workLogs.shiftId))
      .where(
        and(eq(workLogs.status, 'in_progress'), eq(shifts.driverId, driverId))
      )
  );
};

export const bulkWorkLog = async (input: StartWorkLogInput[]) => {
  const firstWorkLog = input[0];

  if (!firstWorkLog) {
    throw new ClientError('Рэйс байхгүй.');
  }

  const shift = await getShiftByPk(firstWorkLog.shiftId);

  return drizzleDb.transaction(async (tx) => {
    const created = await tx.insert(workLogs).values(input).returning();

    await recalculateShiftProducts(tx as typeof drizzleDb, shift);

    return created;
  });
};

export const getWorkLogsByShiftId = async (shiftId: string) => {
  return drizzleDb
    .select({
      ...getTableColumns(workLogs),
      dailyPlan: getTableColumns(dailyPlans),
      stockpile: getTableColumns(stockpiles),
      vehicle: getTableColumns(vehicles),
      miningBlock: getTableColumns(miningBlocks),
    })
    .from(workLogs)
    .leftJoin(stockpiles, eq(stockpiles.id, workLogs.stockpileId))
    .leftJoin(dailyPlans, eq(dailyPlans.id, workLogs.planId))
    .leftJoin(
      vehicles,
      and(eq(dailyPlans.vehicleId, vehicles.id), isNull(vehicles.deletedAt))
    )
    .leftJoin(miningBlocks, eq(miningBlocks.id, dailyPlans.pickUpBlockId))
    .where(eq(workLogs.shiftId, shiftId))
    .orderBy(desc(workLogs.endTime));
};

export const getPendingWorkLogByShiftId = async (shiftId: string) => {
  return drizzleDb
    .select({
      ...getTableColumns(workLogs),
      stockpile: getTableColumns(stockpiles),
    })
    .from(workLogs)
    .leftJoin(stockpiles, eq(stockpiles.id, workLogs.stockpileId))
    .where(
      and(eq(workLogs.shiftId, shiftId), eq(workLogs.status, 'in_progress'))
    )
    .orderBy(desc(workLogs.endTime));
};

export const getTotalWorkLogCountByShiftId = async ({
  shiftId,
}: {
  shiftId: string;
}) => {
  const result = await drizzleDb
    .select({
      soilCount: sql<number>`count(*) filter (where ${stockpiles.type} = 'soil')`,
      coalCount: sql<number>`count(*) filter (where ${stockpiles.type} = 'coal')`,
    })
    .from(workLogs)
    .leftJoin(stockpiles, eq(stockpiles.id, workLogs.stockpileId))
    .where(
      and(ne(workLogs.status, 'cancelled'), eq(workLogs.shiftId, shiftId))
    );

  return {
    soilCount: result[0]?.soilCount ?? 0,
    coalCount: result[0]?.coalCount ?? 0,
  };
};

export const deleteWorkLog = async (id: string) => {
  const existingWorklog = await getWorkLogByPk(id);

  if (!existingWorklog) {
    throw new NotFound('Ажлын тэмдэглэл олдсонгүй.');
  }

  const shift = await getShiftByPk(existingWorklog.shiftId);

  if (!shift) {
    throw new NotFound('Ээлжийн мэдээлэл олдсонгүй.');
  }

  const deletedWorklog = await drizzleDb.transaction(async (tx) => {
    const deleted = first(
      await tx.delete(workLogs).where(eq(workLogs.id, id)).returning()
    );

    const updatedShift = await recalculateShiftProducts(
      tx as typeof drizzleDb,
      shift
    );

    logger.info({
      event: 'delete-worklog',
      data: {
        deletedWorklog: deleted,
        updatedShift,
      },
    });

    return deleted;
  });

  return deletedWorklog;
};
