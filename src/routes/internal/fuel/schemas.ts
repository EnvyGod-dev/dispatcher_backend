import type { UserRole } from '$/context/user/types';
import type { AppEnv } from '$/utils/app-env';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

export const FUEL_ROLES = {
  // fuel_operator: вебэд зөвхөн харна, mobile-аас цэнэглэлт/орлого бүртгэнэ.
  view: ['superadmin', 'admin', 'fuel_operator', 'dispatcher', 'ita', 'manager'],
  operate: ['superadmin', 'admin', 'fuel_operator', 'dispatcher', 'manager'],
  // Хяналт, засвар, тохиргоо: admin, dispatcher, manager.
  supervise: ['superadmin', 'admin', 'dispatcher', 'manager'],
  engineer: ['superadmin', 'admin', 'dispatcher', 'ita', 'manager'],
  manage: ['superadmin', 'admin', 'dispatcher', 'manager'],
} satisfies Record<string, UserRole[]>;

export const orgOf = (c: Context<AppEnv>): string => {
  const organizationId = c.get('currentUser')?.organizationId;

  if (!organizationId) {
    throw new HTTPException(400, { message: 'Байгууллага тодорхойгүй байна.' });
  }

  return organizationId;
};

export const userOf = (c: Context<AppEnv>) => {
  const user = c.get('currentUser');

  if (!user) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  return { id: user.id, role: user.role as string };
};

export const run = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    const e = error as { code?: unknown; message?: string };

    if (error instanceof Error && e.code === undefined) {
      throw new HTTPException(400, { message: error.message });
    }

    throw error;
  }
};

export const notFoundIfNull = <T>(value: T | null | undefined, message = 'Олдсонгүй.'): T => {
  if (value === null || value === undefined) {
    throw new HTTPException(404, { message });
  }

  return value;
};

export const uuid = z.string().uuid();
export const idParam = z.object({ id: uuid });
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Огноо YYYY-MM-DD хэлбэртэй байна.');
export const dateTime = z.string().datetime({ offset: true });
export const liters = z.number().positive('Хэмжээ 0-ээс их байна.').max(1_000_000);
export const nonNegative = z.number().min(0).max(1_000_000);
// Түгээгч тоолуурын заалт 10 оронтой байж болно (fuel_refuelings.meter_* numeric(14, 2)).
export const meterValue = z.number().min(0).max(9_999_999_999);
export const optText = (max = 1000) => z.string().trim().max(max).nullable().optional();
export const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

export const holderTypeEnum = z.enum(['tank', 'dispenser', 'equipment']);
export const measureMethodEnum = z.enum(['meter', 'gauge', 'sensor', 'manual', 'calculated']);
export const fuelTypeEnum = z.enum(['diesel', 'gasoline']);
export const shiftTypeEnum = z.enum(['day', 'night']);
export const alertMetricEnum = z.enum(['liters_per_trip', 'liters_per_m3']);

export const rangeQuery = z.object({ from: dateStr, to: dateStr });

export const optionalRangeQuery = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
});

export const holderParam = z.object({ holderType: holderTypeEnum, id: uuid });

export const toHolder = (holderType: 'tank' | 'dispenser' | 'equipment', id: string) => ({
  holderType,
  tankId: holderType === 'tank' ? id : null,
  vehicleId: holderType === 'tank' ? null : id,
});

export const tankSchema = z.object({
  name: z.string().trim().min(1).max(255),
  location: optText(255),
  capacity: liters.nullable().optional(),
  fuelType: fuelTypeEnum.default('diesel'),
  isActive: z.boolean().optional(),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(255),
  contactPhone: optText(50),
  contactEmail: z.string().email().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const vehicleFuelProfileSchema = z.object({
  model: optText(100),
  fuelTankCapacity: liters.nullable().optional(),
  isFuelDispenser: z.boolean().optional(),
  dispenserCapacity: liters.nullable().optional(),
});

export const normSchema = z.object({
  vehicleModel: z.string().trim().min(1).max(100),
  targetLitersPerTrip: z.number().positive().nullable().optional(),
  targetLitersPerM3: z.number().positive().nullable().optional(),
  thresholdPercent: z.number().min(1).max(200).nullable().optional(),
  isActive: z.boolean().optional(),
  notes: optText(),
});

export const settingsSchema = z.object({
  defaultThresholdPercent: z.number().min(1).max(200).optional(),
  alertWindowDays: z.number().int().min(1).max(31).optional(),
  alertEmailEnabled: z.boolean().optional(),
  actNumberPrefix: z.string().trim().min(1).max(20).optional(),
});

export const recipientSchema = z.object({
  purpose: z.enum(['act', 'alert']),
  email: z.string().email(),
  name: optText(255),
  isCc: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const receiptSchema = z
  .object({
    tankId: uuid,
    supplierId: uuid,
    fuelType: fuelTypeEnum.optional(),
    quantity: liters,
    receivedAt: dateTime,
    operationalDate: dateStr.optional(),
    documentNumber: optText(100),
    transportVehicleNumber: optText(50),
    receivedBy: uuid.optional(),
    attachmentUrls: z.array(z.string().url()).max(20).optional(),
    actNumber: optText(50),
    actSource: z.enum(['generated', 'uploaded']).default('generated'),
    actFileUrl: z.string().url().nullable().optional(),
    notes: optText(),
  })
  .superRefine((v, ctx) => {
    if (v.actSource === 'uploaded' && !v.actFileUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actFileUrl'], message: 'АКТ файл хавсаргана уу.' });
    }
  });

export const receiptsQuery = optionalRangeQuery.extend({
  tankId: uuid.optional(),
  supplierId: uuid.optional(),
  emailStatus: z.enum(['pending', 'sent', 'failed']).optional(),
  includeCancelled: boolQuery.optional(),
});

export const actFileSchema = z.object({
  actFileUrl: z.string().url(),
  sendEmail: z.boolean().optional(),
});

export const receiptChangesSchema = z
  .object({
    tankId: uuid,
    supplierId: uuid,
    quantity: liters,
    receivedAt: dateTime,
    documentNumber: optText(100),
    transportVehicleNumber: optText(50),
    receivedBy: uuid,
    attachmentUrls: z.array(z.string().url()).max(20),
    actFileUrl: z.string().url().nullable(),
    notes: optText(),
  })
  .partial()
  .strict();

export const editRequestSchema = z
  .object({
    type: z.enum(['update', 'cancel']),
    changes: receiptChangesSchema.optional(),
    reason: z.string().trim().min(3, 'Шалтгаан бичнэ үү.').max(1000),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'update' && (!v.changes || Object.keys(v.changes).length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['changes'], message: 'Өөрчлөх талбар оруулна уу.' });
    }
  });

export const reviewSchema = z.object({ note: optText() });

export const rejectSchema = z.object({ note: z.string().trim().min(3).max(1000) });

export const issueSchema = z.object({
  tankId: uuid,
  dispenserVehicleId: uuid,
  quantity: liters,
  issuedAt: dateTime,
  operationalDate: dateStr.optional(),
  issuedBy: uuid.optional(),
  notes: optText(),
});

export const issuesQuery = optionalRangeQuery.extend({
  tankId: uuid.optional(),
  dispenserVehicleId: uuid.optional(),
});

const refuelingBase = z.object({
  clientId: uuid.nullable().optional(),
  sourceType: z.enum(['dispenser', 'tank']).default('dispenser'),
  dispenserVehicleId: uuid.nullable().optional(),
  tankId: uuid.nullable().optional(),
  receiverVehicleId: uuid,
  quantity: liters.nullable().optional(),
  refueledAt: dateTime,
  operationalDate: dateStr.optional(),
  shiftType: shiftTypeEnum.nullable().optional(),
  meterStart: meterValue.nullable().optional(),
  meterEnd: meterValue.nullable().optional(),
  operatorId: uuid.optional(),
  receiverOperatorId: uuid.nullable().optional(),
  miningBlockId: uuid.nullable().optional(),
  locationNote: optText(255),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  notes: optText(),
});

const refuelingRefine = (v: z.infer<typeof refuelingBase>, ctx: z.RefinementCtx) => {
  if (v.sourceType === 'dispenser' && !v.dispenserVehicleId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dispenserVehicleId'], message: 'Түгээгч техникийн парк дугаар заавал.' });
  }

  if (v.sourceType === 'tank' && !v.tankId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tankId'], message: 'Сав заавал.' });
  }

  if (v.quantity == null && (v.meterStart == null || v.meterEnd == null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quantity'], message: 'Хэмжээ эсвэл тоолуурын заалт оруулна уу.' });
  }
};

export const refuelingSchema = refuelingBase.superRefine(refuelingRefine);

export const refuelingSyncSchema = z.object({
  items: z.array(refuelingBase.extend({ clientId: uuid }).superRefine(refuelingRefine)).min(1).max(500),
});

export const refuelingsQuery = optionalRangeQuery.extend({
  receiverVehicleId: uuid.optional(),
  dispenserVehicleId: uuid.optional(),
  tankId: uuid.optional(),
  shiftType: shiftTypeEnum.optional(),
  includeCancelled: boolQuery.optional(),
});

export const refuelingUpdateSchema = z
  .object({
    tankId: uuid.optional(),
    receiverVehicleId: uuid.optional(),
    quantity: liters.nullable().optional(),
    meterStart: meterValue.nullable().optional(),
    meterEnd: meterValue.nullable().optional(),
    refueledAt: dateTime.optional(),
    operationalDate: dateStr.optional(),
    shiftType: shiftTypeEnum.nullable().optional(),
    notes: optText(),
    reason: z.string().trim().min(3, 'Шалтгаан бичнэ үү.').max(1000),
  })
  .strict()
  .superRefine((v, ctx) => {
    const { reason: _reason, ...changes } = v;

    if (Object.values(changes).every((value) => value === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Өөрчлөх талбар оруулна уу.' });
    }
  });

export const refuelingCancelSchema = z.object({
  reason: z.string().trim().min(3, 'Шалтгаан бичнэ үү.').max(1000),
});

export const openingBalanceSchema = z.object({
  holderType: holderTypeEnum,
  holderId: uuid,
  balanceAt: dateTime,
  operationalDate: dateStr.optional(),
  quantity: nonNegative,
  method: measureMethodEnum,
  notes: optText(),
});

export const measurementSchema = z.object({
  holderType: holderTypeEnum,
  holderId: uuid,
  measuredAt: dateTime,
  operationalDate: dateStr.optional(),
  measuredQuantity: nonNegative,
  method: measureMethodEnum,
  applyAdjustment: z.boolean().optional(),
  notes: optText(),
});

export const measurementsQuery = optionalRangeQuery.extend({
  holderType: holderTypeEnum.optional(),
  tankId: uuid.optional(),
  vehicleId: uuid.optional(),
});

export const productionStatSchema = z.object({
  vehicleId: uuid,
  operationalDate: dateStr,
  shiftType: shiftTypeEnum,
  tripCount: z.number().int().min(0),
  volumeM3: z.number().min(0),
  tonnage: z.number().min(0).nullable().optional(),
  notes: optText(),
});

export const consumptionQuery = rangeQuery.extend({
  vehicleId: uuid.optional(),
  vehicleModel: z.string().trim().max(100).optional(),
  vehicleType: z.string().trim().max(50).optional(),
  shiftType: shiftTypeEnum.optional(),
});

export const alertsQuery = optionalRangeQuery.extend({
  status: z.enum(['open', 'closed']).optional(),
  vehicleId: uuid.optional(),
  metric: alertMetricEnum.optional(),
});

export const alertEvaluateSchema = z.object({
  periodEnd: dateStr.optional(),
  windowDays: z.number().int().min(1).max(31).optional(),
  notify: z.boolean().optional(),
});

export const alertCloseSchema = z.object({
  reason: z.string().trim().min(3, 'Шалтгаанаа тайлбарлана уу.').max(1000),
});