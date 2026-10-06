import { drizzleDb } from '$/libs/database/db';

import { fuelMeters, fuelTanks, vehicles } from '$/libs/database/schema';

import { and, asc, eq, lte, sql } from 'drizzle-orm';

import { type DbOrTx, type Holder, type Tx, insertAudit, now, requireRow } from './common';

import { getDispenserVehicle, getOrgTank } from './lookups';

export type FuelMeter = typeof fuelMeters.$inferSelect;

/** Заалт: бичсэн хэлбэр (урд талын 0-уудтай) ба тоон утга. */
export type MeterReading = { text: string; value: bigint };

/**
 * Заалтыг цэвэрлэнэ. Зөвхөн цифр (урд талын 0-ууд хадгалагдана).
 * Хуучин апп тоо (number) илгээдэг тул тоог ч хүлээж авна.
 * Тоолуурын оронгийн тоо мэдэгдэж байвал урт нь түүнээс хэтрэхгүй, дутуу бол урдаас нь 0-оор нөхнө.
 */
export const normalizeReading = (
  raw: string | number | null | undefined,
  digits?: number | null,
): MeterReading | null => {
  if (raw === null || raw === undefined) {
    return null;
  }

  let text: string;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) {
      throw new Error('Тоолуурын заалт сөрөг бус бүхэл тоо байна.');
    }

    text = BigInt(raw).toString();
  } else {
    text = raw.trim();

    if (text === '') {
      return null;
    }

    // Хуучин бичлэг "12345.00" хэлбэртэй байж болно.
    text = text.replace(/\.0+$/, '');

    if (!/^\d+$/.test(text)) {
      throw new Error('Тоолуурын заалт зөвхөн цифр байна.');
    }
  }

  if (digits && digits > 0) {
    if (text.length > digits) {
      const trimmed = text.replace(/^0+(?=\d)/, '');

      if (trimmed.length > digits) {
        throw new Error(`Тоолуур ${digits} оронтой. "${text}" заалт хэт урт байна.`);
      }

      text = trimmed;
    }

    text = text.padStart(digits, '0');
  }

  return { text, value: BigInt(text) };
};

/**
 * Эхний, төгсгөлийн заалтын зөрүү (литр). Тоолуур дүүрээд 0-ээс эхэлсэн бол (жишээ нь 9999950 → 0000120)
 * оронгийн тоогоор нөхөж тооцно. Төгсгөл нь эхнээсээ бага бөгөөд дүүрсэн биш бол (бичих алдаа) алдаа буцаана.
 */
export const meterDelta = (start: MeterReading, end: MeterReading, digits?: number | null): number => {
  if (end.value >= start.value) {
    return Number(end.value - start.value);
  }

  if (digits && digits > 0) {
    const modulus = 10n ** BigInt(digits);
    const delta = end.value + modulus - start.value;

    // Дүүрч эргэсэн бол зөрүү бага байна (тоолуурын багтаамжийн 10%-иас бага).
    if (delta * 10n <= modulus) {
      return Number(delta);
    }
  }

  throw new Error('Тоолуурын төгсгөлийн заалт эхлэлээс бага байна.');
};

const holderWhere = (organizationId: string, holder: Holder) =>
  holder.holderType === 'tank'
    ? and(eq(fuelMeters.organizationId, organizationId), eq(fuelMeters.tankId, holder.tankId!))
    : and(eq(fuelMeters.organizationId, organizationId), eq(fuelMeters.vehicleId, holder.vehicleId!));

export const getMeterFor = async (db: DbOrTx, organizationId: string, holder: Holder) => {
  const [meter] = await db.select().from(fuelMeters).where(holderWhere(organizationId, holder)).limit(1);

  return meter ?? null;
};

/**
 * Олголт/зарлагын дараа тоолуурын одоогийн заалтыг шинэчилнэ.
 * Сүлжээгүй үед хуучин бичлэг хожуу ирвэл (цаг нь сүүлийн заалтаас өмнө) заалтыг ухраахгүй.
 */
export const advanceMeter = async (
  tx: Tx,
  meter: FuelMeter | null,
  end: MeterReading | null,
  at: string,
  userId: string,
) => {
  if (!meter || !end) {
    return;
  }

  // Нөхцөлтэй шинэчлэл: зэрэг ирсэн бичлэгүүдээс хамгийн сүүлийн цагтай нь үлдэнэ.
  await tx
    .update(fuelMeters)
    .set({ reading: end.text, readingAt: at, updatedBy: userId, updatedAt: now() })
    .where(and(eq(fuelMeters.id, meter.id), lte(fuelMeters.readingAt, at)));
};

/**
 * Бичлэгийг засах/цуцлах үед: тоолуурын одоогийн заалт яг энэ бичлэгээс гарсан бол түүнийг дагуулж засна.
 */
export const followMeterEdit = async (
  tx: Tx,
  meter: FuelMeter | null,
  previous: { endReading: string | null; at: string },
  next: { reading: string | null; at: string } | null,
  userId: string,
) => {
  if (!meter || !previous.endReading) {
    return;
  }

  const sameRecord =
    meter.reading === previous.endReading && new Date(meter.readingAt).getTime() === new Date(previous.at).getTime();

  if (!sameRecord || !next?.reading) {
    return;
  }

  await tx
    .update(fuelMeters)
    .set({ reading: next.reading, readingAt: next.at, updatedBy: userId, updatedAt: now() })
    .where(eq(fuelMeters.id, meter.id));
};

export const getFuelMeters = async (organizationId: string) => {
  const rows = await drizzleDb
    .select({
      meter: fuelMeters,
      tankName: fuelTanks.name,
      vehicleName: vehicles.name,
      vehicleMineNumber: vehicles.mineNumber,
    })
    .from(fuelMeters)
    .leftJoin(fuelTanks, eq(fuelTanks.id, fuelMeters.tankId))
    .leftJoin(vehicles, eq(vehicles.id, fuelMeters.vehicleId))
    .where(eq(fuelMeters.organizationId, organizationId))
    .orderBy(asc(fuelMeters.holderType), asc(sql`COALESCE(${fuelTanks.name}, ${vehicles.mineNumber}, ${vehicles.name})`));

  return rows.map((r) => ({
    ...r.meter,
    holderId: (r.meter.tankId ?? r.meter.vehicleId)!,
    holderName:
      r.meter.holderType === 'tank'
        ? (r.tankName ?? '—')
        : (r.vehicleMineNumber ?? r.vehicleName ?? '—'),
  }));
};

const resolveHolder = async (db: DbOrTx, organizationId: string, holderType: 'tank' | 'dispenser', holderId: string) => {
  if (holderType === 'tank') {
    const tank = await getOrgTank(db, organizationId, holderId, false);

    return { holder: { holderType, tankId: tank.id } as Holder, label: tank.name };
  }

  const dispenser = await getDispenserVehicle(db, organizationId, holderId);

  return {
    holder: { holderType, vehicleId: dispenser.id } as Holder,
    label: `Түгээх машин ${dispenser.mineNumber ?? dispenser.name}`,
  };
};

/** Тоолуур бүртгэх: оронгийн тоо, одоогийн заалт. Тэндээс эхэлж тооцно. */
export const createFuelMeter = async (input: {
  organizationId: string;
  holderType: 'tank' | 'dispenser';
  holderId: string;
  digits: number;
  reading: string;
  readingAt?: string;
  notes?: string | null;
  userId: string;
}) => {
  return drizzleDb.transaction(async (tx) => {
    const { holder, label } = await resolveHolder(tx, input.organizationId, input.holderType, input.holderId);

    if (await getMeterFor(tx, input.organizationId, holder)) {
      throw new Error(`${label}: тоолуур бүртгэгдсэн байна. Заалтыг шинэчилнэ үү.`);
    }

    const reading = normalizeReading(input.reading, input.digits)!;

    const meter = requireRow(
      await tx
        .insert(fuelMeters)
        .values({
          organizationId: input.organizationId,
          holderType: input.holderType,
          tankId: holder.tankId ?? null,
          vehicleId: holder.vehicleId ?? null,
          digits: input.digits,
          reading: reading.text,
          readingAt: input.readingAt ?? now(),
          notes: input.notes ?? null,
          createdBy: input.userId,
          updatedBy: input.userId,
        })
        .returning(),
    );

    await insertAudit(tx, {
      organizationId: input.organizationId,
      entityType: 'fuel_meter',
      entityId: meter.id,
      action: 'create',
      after: meter,
      userId: input.userId,
    });

    return meter;
  });
};

/** Заалтыг шинээр бүртгэх (тоолуур солигдсон, засвар хийсэн гэх мэт) эсвэл оронгийн тоог засах. */
export const updateFuelMeter = async (input: {
  organizationId: string;
  id: string;
  digits?: number;
  reading?: string;
  readingAt?: string;
  notes?: string | null;
  userId: string;
}) => {
  return drizzleDb.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(fuelMeters)
      .where(and(eq(fuelMeters.id, input.id), eq(fuelMeters.organizationId, input.organizationId)))
      .for('update')
      .limit(1);

    if (!before) {
      throw new Error('Тоолуур олдсонгүй.');
    }

    const digits = input.digits ?? before.digits;
    const reading = normalizeReading(input.reading ?? before.reading, digits)!;
    const readingChanged = input.reading !== undefined;

    const after = requireRow(
      await tx
        .update(fuelMeters)
        .set({
          digits,
          reading: reading.text,
          ...(readingChanged && { readingAt: input.readingAt ?? now() }),
          ...(input.notes !== undefined && { notes: input.notes }),
          updatedBy: input.userId,
          updatedAt: now(),
        })
        .where(eq(fuelMeters.id, before.id))
        .returning(),
    );

    await insertAudit(tx, {
      organizationId: input.organizationId,
      entityType: 'fuel_meter',
      entityId: after.id,
      action: 'update',
      before,
      after,
      userId: input.userId,
    });

    return after;
  });
};

export const deleteFuelMeter = async (organizationId: string, id: string, userId: string) => {
  return drizzleDb.transaction(async (tx) => {
    const [before] = await tx
      .delete(fuelMeters)
      .where(and(eq(fuelMeters.id, id), eq(fuelMeters.organizationId, organizationId)))
      .returning();

    if (!before) {
      throw new Error('Тоолуур олдсонгүй.');
    }

    await insertAudit(tx, {
      organizationId,
      entityType: 'fuel_meter',
      entityId: before.id,
      action: 'delete',
      before,
      userId,
    });

    return before;
  });
};
