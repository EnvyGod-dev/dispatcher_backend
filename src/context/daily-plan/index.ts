import { drizzleDb } from '$/libs/database/db';
import {
  dailyPlans,
  enumDailyPlanStatus,
  miningBlocks,
  routes,
  stockpiles,
  vehicles,
} from '$/libs/database/schema';
import { firstOrNull } from '$/libs/database/utils';
import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  ne,
  sql,
} from 'drizzle-orm';
import { newDateInUb } from '$/utils/date-formatter';
import type { VehicleType } from '../vehicle/types';
import type { ShiftType } from '../shift/types';

export type DailyPlanStatus = (typeof enumDailyPlanStatus.enumValues)[number];

export type CreateDailyPlanInput = typeof dailyPlans.$inferInsert;

export interface UpdateDailyPlanInput {
  id: string;
  routeId?: string;
  pickUpBlockId?: string;
  stockpileIds?: string[];
  transportAmount?: string;
  vehicleId?: string;
  shiftType?: ShiftType;
  date?: string;
  status?: DailyPlanStatus;
  vehicleType?: VehicleType;
  allowConcurrentActive?: boolean;
}

export async function getDailyPlanById(id: string) {
  const [plan] = await drizzleDb
    .select()
    .from(dailyPlans)
    .where(eq(dailyPlans.id, id));

  return plan;
}

export async function getActiveDailyPlanConflict(id: string) {
  const plan = await getDailyPlanById(id);

  if (!plan) {
    return null;
  }

  const [conflictingPlan] = await drizzleDb
    .select()
    .from(dailyPlans)
    .where(
      and(
        eq(dailyPlans.organizationId, plan.organizationId),
        eq(dailyPlans.date, plan.date),
        eq(dailyPlans.shiftType, plan.shiftType),
        eq(dailyPlans.vehicleId, plan.vehicleId),
        eq(dailyPlans.status, 'active'),
        ne(dailyPlans.id, plan.id)
      )
    );

  return conflictingPlan ?? null;
}

export async function getDailyPlans(
  pagination: { limit: number; offset: number },
  filters: {
    organizationId: string;
    date?: string;
    shiftType?: ShiftType;
    status?: DailyPlanStatus;
  }
) {
  const targetDate = filters.date ?? newDateInUb().format('YYYY-MM-DD');

  const plans = await drizzleDb
    .select({
      ...getTableColumns(dailyPlans),
      route: getTableColumns(routes),
      miningBlock: getTableColumns(miningBlocks),
      vehicle: getTableColumns(vehicles),
    })
    .from(dailyPlans)
    .leftJoin(routes, eq(routes.id, dailyPlans.routeId))
    .leftJoin(miningBlocks, eq(miningBlocks.id, dailyPlans.pickUpBlockId))
    .leftJoin(vehicles, and(eq(vehicles.id, dailyPlans.vehicleId), isNull(vehicles.deletedAt)))
    .where(
      and(
        eq(dailyPlans.organizationId, filters.organizationId),
        eq(dailyPlans.date, targetDate),
        filters.status ? eq(dailyPlans.status, filters.status) : undefined,
        filters.shiftType
          ? eq(dailyPlans.shiftType, filters.shiftType)
          : undefined
      )
    )
    .limit(pagination.limit)
    .offset(pagination.offset)
    .orderBy(desc(dailyPlans.createdAt));

  // get all stockpile IDs from the plans
  const allStockpileIds = plans.flatMap((plan) => plan.stockpileIds || []);

  // fetch all stockpiles in one query
  const stockpilesData =
    allStockpileIds.length > 0
      ? await drizzleDb
          .select()
          .from(stockpiles)
          .where(inArray(stockpiles.id, allStockpileIds))
      : [];

  // create a map for quick lookup
  const stockpileMap = new Map(stockpilesData.map((s) => [s.id, s]));

  const totalCount = await drizzleDb
    .select({ count: sql<number>`count(*)` })
    .from(dailyPlans)
    .where(
      and(
        eq(dailyPlans.organizationId, filters.organizationId),
        eq(dailyPlans.date, targetDate),
        filters.status ? eq(dailyPlans.status, filters.status) : undefined,
        filters.shiftType
          ? eq(dailyPlans.shiftType, filters.shiftType)
          : undefined
      )
    );

  return plans.map((plan) => {
    // get stockpiles for this plan
    const planStockpiles = (plan.stockpileIds || [])
      .map((id) => stockpileMap.get(id))
      .filter(Boolean);

    return {
      ...plan,
      totalCount: totalCount[0]?.count ?? 0,

      routeCode: plan.route?.routeCode || null,

      miningBlockId: plan.miningBlock?.id || null,
      miningBlockName: plan.miningBlock?.name || null,
      miningBlockLayerNumber: plan.miningBlock?.layerNumber || null,

      // return array of stockpiles instead of single stockpile
      stockpiles: planStockpiles.map((s) => ({
        id: s?.id,
        type: s?.type,
        layerNumber: s?.layerNumber,
      })),

      vehicleId: plan.vehicle?.id || null,
      vehicleName: plan.vehicle?.name || null,
      vehicleNumber: plan.vehicle?.vehicleNumber || null,
      vehicleType: plan.vehicle?.type || null,
      vehicleCode: plan.vehicle?.code || null,
    };
  });
}

export const getActiveDailyPlan = async ({
  vehicleId,
  shiftType,
  organizationId,
}: {
  vehicleId: string;
  shiftType: ShiftType;
  organizationId: string;
}) => {
  const existing = await drizzleDb
    .select()
    .from(dailyPlans)
    .where(
      and(
        eq(dailyPlans.organizationId, organizationId),
        eq(dailyPlans.vehicleId, vehicleId),
        eq(dailyPlans.shiftType, shiftType),
        eq(dailyPlans.status, 'active'),
        eq(dailyPlans.date, newDateInUb().format('YYYY-MM-DD'))
      )
    );

  return existing;
};

export async function createDailyPlan(input: CreateDailyPlanInput) {
  return drizzleDb.transaction(async (tx) => {
    await tx
      .update(dailyPlans)
      .set({ status: 'completed' })
      .where(
        and(
          eq(dailyPlans.organizationId, input.organizationId),
          eq(dailyPlans.date, input.date),
          eq(dailyPlans.shiftType, input.shiftType),
          eq(dailyPlans.vehicleId, input.vehicleId),
          eq(dailyPlans.status, 'active')
        )
      );

    return firstOrNull(
      await tx
        .insert(dailyPlans)
        .values({ ...input, status: input.status ?? 'active' })
        .returning()
    );
  });
}

export async function updateDailyPlan(input: UpdateDailyPlanInput) {
  const [plan] = await drizzleDb
    .update(dailyPlans)
    .set({
      ...(input.routeId && { routeId: input.routeId }),
      ...(input.pickUpBlockId && { pickUpBlockId: input.pickUpBlockId }),
      ...(input.stockpileIds && { stockpileIds: input.stockpileIds }),
      ...(input.transportAmount !== undefined && {
        transportAmount: input.transportAmount,
      }),
      ...(input.vehicleId && { vehicleId: input.vehicleId }),
      ...(input.shiftType && { shiftType: input.shiftType }),
      ...(input.date && { date: input.date }),
      ...(input.status && { status: input.status }),
      ...(input.vehicleType && {
        vehicleType: input.vehicleType,
      }),
    })
    .where(eq(dailyPlans.id, input.id))
    .returning();

  return plan;
}

export async function deleteDailyPlan(id: string) {
  const [plan] = await drizzleDb
    .delete(dailyPlans)
    .where(eq(dailyPlans.id, id))
    .returning();

  return plan;
}


export const getDailyPlanByDateType = async ({date, shiftType, organizationId}:{
  date:string 
  shiftType: ShiftType
  organizationId: string
}) => {
  const plan = await drizzleDb.select({
      ...getTableColumns(dailyPlans),
      route: getTableColumns(routes),
      miningBlock: getTableColumns(miningBlocks),
      vehicle: getTableColumns(vehicles),
    })
    .from(dailyPlans)
    .leftJoin(routes, eq(routes.id, dailyPlans.routeId))
    .leftJoin(miningBlocks, eq(miningBlocks.id, dailyPlans.pickUpBlockId))
    .leftJoin(vehicles, and(eq(vehicles.id, dailyPlans.vehicleId), isNull(vehicles.deletedAt)))
    .where(and(
      eq(dailyPlans.organizationId, organizationId), 
      eq(dailyPlans.shiftType, shiftType), 
      eq(dailyPlans.date, date))
    )
  return plan
}
