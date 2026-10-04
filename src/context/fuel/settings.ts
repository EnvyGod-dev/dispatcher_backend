import { drizzleDb } from '$/libs/database/db';

import {
  fuelNotificationRecipients,
  fuelSettings,
} from '$/libs/database/schema';

import {
  and,
  asc,
  eq,
  type SQL,
} from 'drizzle-orm';

import {
  now,
  isUniqueViolation,
} from './common';

export const getFuelSettings = async (organizationId: string) => {
  const [settings] = await drizzleDb
    .select()
    .from(fuelSettings)
    .where(eq(fuelSettings.organizationId, organizationId))
    .limit(1);

  return settings ?? null;
};

export const upsertFuelSettings = async (organizationId: string, input: Partial<typeof fuelSettings.$inferInsert>) => {
  const { id: _id, organizationId: _org, createdAt: _created, ...values } = input;

  if (values.alertWindowDays !== undefined && (values.alertWindowDays < 1 || values.alertWindowDays > 31)) {
    throw new Error('Alert тооцох цонх 1–31 хоног байна.');
  }

  const [settings] = await drizzleDb
    .insert(fuelSettings)
    .values({ organizationId, ...values })
    .onConflictDoUpdate({
      target: fuelSettings.organizationId,
      set: { ...values, updatedAt: now() },
    })
    .returning();

  return settings;
};

export const getFuelNotificationRecipients = async (organizationId: string, purpose?: 'act' | 'alert') => {
  const conditions: SQL[] = [
    eq(fuelNotificationRecipients.organizationId, organizationId),
    eq(fuelNotificationRecipients.isActive, true),
  ];

  if (purpose) {
    conditions.push(eq(fuelNotificationRecipients.purpose, purpose));
  }

  return drizzleDb
    .select()
    .from(fuelNotificationRecipients)
    .where(and(...conditions))
    .orderBy(asc(fuelNotificationRecipients.email));
};

export const createFuelNotificationRecipient = async (input: typeof fuelNotificationRecipients.$inferInsert) => {
  try {
    const [recipient] = await drizzleDb
      .insert(fuelNotificationRecipients)
      .values({ ...input, email: input.email.trim().toLowerCase() })
      .returning();

    return recipient;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('Энэ и-мэйл хаяг бүртгэгдсэн байна.');
    }

    throw error;
  }
};

export const updateFuelNotificationRecipient = async (
  organizationId: string,
  id: string,
  input: Partial<typeof fuelNotificationRecipients.$inferInsert>,
) => {
  const { id: _id, organizationId: _org, createdAt: _created, ...values } = input;

  const [recipient] = await drizzleDb
    .update(fuelNotificationRecipients)
    .set({
      ...values,
      ...(values.email !== undefined && { email: values.email.trim().toLowerCase() }),
      updatedAt: now(),
    })
    .where(and(eq(fuelNotificationRecipients.id, id), eq(fuelNotificationRecipients.organizationId, organizationId)))
    .returning();

  return recipient ?? null;
};

export const deleteFuelNotificationRecipient = async (organizationId: string, id: string) => {
  const [recipient] = await drizzleDb
    .delete(fuelNotificationRecipients)
    .where(and(eq(fuelNotificationRecipients.id, id), eq(fuelNotificationRecipients.organizationId, organizationId)))
    .returning();

  return recipient ?? null;
};