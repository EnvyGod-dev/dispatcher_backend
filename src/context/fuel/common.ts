import { drizzleDb } from '$/libs/database/db';

import {
  fuelAuditLogs,
  fuelLedgerEntries,
} from '$/libs/database/schema';

type Db = typeof drizzleDb;

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type DbOrTx = Db | Tx;

export type HolderType = 'tank' | 'dispenser' | 'equipment';

export type ShiftType = 'day' | 'night';

export type MeasureMethod = 'meter' | 'gauge' | 'sensor' | 'manual' | 'calculated';

export type AlertMetric = 'liters_per_trip' | 'liters_per_m3';

export type BaselineSource = 'group_average' | 'norm';

export type Granularity = 'day' | 'week' | 'month';

export type Holder = {
  holderType: HolderType;
  tankId?: string | null;
  vehicleId?: string | null;
};

export const L = fuelLedgerEntries;

const UB_OFFSET_MS = 8 * 60 * 60 * 1000;

export const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const result = Number(value);

  return Number.isFinite(result) ? result : 0;
};

export const toNumberOrNull = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const result = Number(value);

  return Number.isFinite(result) ? result : null;
};

export const round = (value: number, scale = 2): number => {
  const factor = 10 ** scale;

  return Math.round(value * factor) / factor;
};

export const toNumeric = (value: string | number, scale = 2): string => {
  return round(toNumber(value), scale).toFixed(scale);
};

export const toNumericOrNull = (value: string | number | null | undefined, scale = 2): string | null => {
  return value === null || value === undefined || value === '' ? null : toNumeric(value, scale);
};

export const now = () => new Date().toISOString();

export const toOperationalDate = (value: string | Date): string => {
  return new Date(new Date(value).getTime() + UB_OFFSET_MS).toISOString().slice(0, 10);
};

export const todayUB = (): string => toOperationalDate(new Date());

export const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);

  d.setUTCDate(d.getUTCDate() + days);

  return d.toISOString().slice(0, 10);
};

export const errorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

export const isUniqueViolation = (error: unknown): boolean => {
  const e = error as { code?: string; cause?: { code?: string } };

  return e?.code === '23505' || e?.cause?.code === '23505';
};

export const assertPositive = (value: string | number | null | undefined, message = 'Хэмжээ 0-ээс их байх ёстой.') => {
  if (toNumber(value) <= 0) {
    throw new Error(message);
  }
};

export const assertNonNegative = (value: string | number | null | undefined, message = 'Хэмжээ сөрөг байж болохгүй.') => {
  if (toNumber(value) < 0) {
    throw new Error(message);
  }
};

export const assertRange = (from: string, to: string, maxDays = 366) => {
  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;

  if (Number.isNaN(days) || days < 0) {
    throw new Error('Эхлэх огноо дуусах огнооноос хойш байна.');
  }

  if (days > maxDays) {
    throw new Error(`Хугацаа ${maxDays} хоногоос ихгүй байна.`);
  }
};

export const vehicleGroupKey = (vehicle: { model: string | null; type: string | null }) => {
  return vehicle.model?.trim() || (vehicle.type ? `type:${vehicle.type}` : 'unknown');
};

type AuditInput = {
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  userId?: string | null;
};

export const insertAudit = async (db: DbOrTx, input: AuditInput) => {
  await db.insert(fuelAuditLogs).values({
    organizationId: input.organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
    userId: input.userId ?? null,
  });
};

export const requireRow = <T>(rows: T[], message = 'Бүртгэл хадгалагдсангүй.'): T => {
  const row = rows[0];

  if (row === undefined) {
    throw new Error(message);
  }

  return row;
};