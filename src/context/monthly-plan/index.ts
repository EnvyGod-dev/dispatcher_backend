import { drizzleDb } from '$/libs/database/db';
import { monthlyPlans } from '$/libs/database/schema';
import { firstOrNull } from '$/libs/database/utils';
import { and, count, desc, eq, sql } from 'drizzle-orm';

export type CreateMonthlyPlanInput = typeof monthlyPlans.$inferInsert;

export interface UpdateMonthlyPlanInput {
  id: string;
  coalAmount: string;
  soilAmount: string;
}

export const getMonthlyPlans = async (
  pagination: { limit: number; offset: number },
  filters: { organizationId: string; date?: string }
) => {
  return drizzleDb
    .select()
    .from(monthlyPlans)
    .where(
      and(
        eq(monthlyPlans.organizationId, filters.organizationId),
        filters.date
          ? eq(sql`DATE(${monthlyPlans.createdAt})`, new Date(filters.date))
          : undefined
      )
    )
    .limit(pagination.limit)
    .offset(pagination.offset)
    .orderBy(desc(monthlyPlans.year), desc(monthlyPlans.month));
};

export const getMonthlyPlanByMonth = async ({
  organizationId,
  year,
  month,
}: {
  organizationId: string;
  year: number;
  month: number;
}) => {
  return firstOrNull(
    await drizzleDb
      .select()
      .from(monthlyPlans)
      .where(
        and(
          eq(monthlyPlans.organizationId, organizationId),
          eq(monthlyPlans.year, year),
          eq(monthlyPlans.month, month)
        )
      )
  );
};

export const getMonthlyPlanTotalCount = async ({
  organizationId,
}: {
  organizationId: string;
}) => {
  const query = await drizzleDb
    .select({ count: count() })
    .from(monthlyPlans)
    .where(eq(monthlyPlans.organizationId, organizationId));

  return query[0]?.count.toString() ?? '0';
};

export async function createMonthlyPlan(input: CreateMonthlyPlanInput) {
  return firstOrNull(
    await drizzleDb.insert(monthlyPlans).values(input).returning()
  );
}

export async function updateMonthlyPlan(input: UpdateMonthlyPlanInput) {
  const [plan] = await drizzleDb
    .update(monthlyPlans)
    .set({
      ...(input.coalAmount && { coalAmount: input.coalAmount }),
      ...(input.soilAmount && { soilAmount: input.soilAmount }),
    })
    .where(eq(monthlyPlans.id, input.id))
    .returning();

  return plan;
}

export async function deleteMonthlyPlan(id: string) {
  const [plan] = await drizzleDb
    .delete(monthlyPlans)
    .where(eq(monthlyPlans.id, id))
    .returning();

  return plan;
}
