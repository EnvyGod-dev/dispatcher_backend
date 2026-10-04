import { drizzleDb } from '$/libs/database/db';
import { shiftReportComments } from '$/libs/database/schema';
import { and, eq } from 'drizzle-orm';

export const upsertShiftReportComment = async ({
  organizationId,
  date,
  shiftType,
  comment,
  createdBy,
}: {
  organizationId: string;
  date: string;
  shiftType: 'day' | 'night';
  comment: string;
  createdBy: string;
}) => {
  const [result] = await drizzleDb
    .insert(shiftReportComments)
    .values({ organizationId, date, shiftType, comment, createdBy })
    .onConflictDoUpdate({
      target: [
        shiftReportComments.organizationId,
        shiftReportComments.date,
        shiftReportComments.shiftType,
      ],
      set: {
        comment,
        createdBy,
        updatedAt: new Date().toISOString(),
      },
    })
    .returning();

  return result;
};

export const deleteShiftReportComment = async ({
  organizationId,
  date,
  shiftType,
}: {
  organizationId: string;
  date: string;
  shiftType: 'day' | 'night';
}) => {
  await drizzleDb
    .delete(shiftReportComments)
    .where(
      and(
        eq(shiftReportComments.organizationId, organizationId),
        eq(shiftReportComments.date, date),
        eq(shiftReportComments.shiftType, shiftType),
      ),
    );
};
