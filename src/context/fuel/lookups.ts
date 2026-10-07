import {
  fuelSettings,
  fuelSuppliers,
  fuelTanks,
  users,
  vehicles,
} from '$/libs/database/schema';

import {
  and,
  eq,
  isNull,
  sql,
} from 'drizzle-orm';

import {
  type DbOrTx,
  type Holder,
} from './common';
import { assertHolderId } from './ledger';


export const getOrgTank = async (db: DbOrTx, organizationId: string, tankId: string, requireActive = true) => {
  const [tank] = await db
    .select()
    .from(fuelTanks)
    .where(and(eq(fuelTanks.id, tankId), eq(fuelTanks.organizationId, organizationId)))
    .limit(1);

  if (!tank) {
    throw new Error('Агуулах олдсонгүй.');
  }

  if (requireActive && !tank.isActive) {
    throw new Error(`${tank.name}: агуулах идэвхгүй байна.`);
  }

  return tank;
};

export const getOrgSupplier = async (db: DbOrTx, organizationId: string, supplierId: string) => {
  const [supplier] = await db
    .select()
    .from(fuelSuppliers)
    .where(and(eq(fuelSuppliers.id, supplierId), eq(fuelSuppliers.organizationId, organizationId)))
    .limit(1);

  if (!supplier) {
    throw new Error('Нийлүүлэгч олдсонгүй.');
  }

  if (!supplier.isActive) {
    throw new Error(`${supplier.name}: нийлүүлэгч идэвхгүй байна.`);
  }

  return supplier;
};

export const getOrgVehicle = async (db: DbOrTx, organizationId: string, vehicleId: string, label = 'Техник') => {
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, organizationId), isNull(vehicles.deletedAt)))
    .limit(1);

  if (!vehicle) {
    throw new Error(`${label}: техник олдсонгүй.`);
  }

  return vehicle;
};

/**
 * Түгээгч (түлшний) машин: одоогийн уурхайд ST860, ST861 хоёр л түлш түгээнэ.
 * Өөр машин нэмэгдвэл вебээс техникийн түлшний тохиргоонд "түгээгч" (isFuelDispenser) гэж тэмдэглэнэ.
 * Парк дугаарыг том үсэг болгож, зай/зураасыг хасаж тулгана ("st 860", "ST-860" → "ST860").
 */
export const DISPENSER_MINE_NUMBERS = ['ST860', 'ST861'] as const;

const normalizeMineNumber = (value: string | null | undefined) => (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const isDispenserVehicle = (vehicle: { isFuelDispenser: boolean | null; mineNumber: string | null; code: string | null }) =>
  !!vehicle.isFuelDispenser ||
  (DISPENSER_MINE_NUMBERS as readonly string[]).includes(normalizeMineNumber(vehicle.mineNumber)) ||
  (DISPENSER_MINE_NUMBERS as readonly string[]).includes(normalizeMineNumber(vehicle.code));

const normalizedSql = (column: typeof vehicles.mineNumber | typeof vehicles.code) =>
  sql`regexp_replace(upper(coalesce(${column}, '')), '[^A-Z0-9]', '', 'g')`;

export const dispenserVehicleCondition = () =>
  sql`(${vehicles.isFuelDispenser} = true OR ${normalizedSql(vehicles.mineNumber)} IN (${sql.join(
    DISPENSER_MINE_NUMBERS.map((n) => sql`${n}`),
    sql`, `,
  )}) OR ${normalizedSql(vehicles.code)} IN (${sql.join(
    DISPENSER_MINE_NUMBERS.map((n) => sql`${n}`),
    sql`, `,
  )}))`;

export const getDispenserVehicle = async (db: DbOrTx, organizationId: string, vehicleId: string) => {
  const vehicle = await getOrgVehicle(db, organizationId, vehicleId, 'Түгээх машин');

  if (!isDispenserVehicle(vehicle)) {
    throw new Error(`${vehicle.mineNumber ?? vehicle.name}: түгээх машин (бенз чанагч) гэж тохируулагдаагүй байна.`);
  }

  return vehicle;
};

export const assertOrgUser = async (db: DbOrTx, organizationId: string, userId: string, label: string) => {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId), isNull(users.deletedAt)))
    .limit(1);

  if (!user) {
    throw new Error(`${label}: хэрэглэгч олдсонгүй.`);
  }
};

export const holderLabel = async (db: DbOrTx, organizationId: string, holder: Holder) => {
  assertHolderId(holder);

  if (holder.holderType === 'tank') {
    const tank = await getOrgTank(db, organizationId, holder.tankId!, false);

    return tank.name;
  }

  if (holder.holderType === 'dispenser') {
    // Өмнө бүртгэгдсэн хөдөлгөөний нэрийг харуулахад шүүлтүүр шаардахгүй.
    const vehicle = await getOrgVehicle(db, organizationId, holder.vehicleId!, 'Түгээх машин');

    return `Түгээх машин ${vehicle.mineNumber ?? vehicle.name}`;
  }

  const vehicle = await getOrgVehicle(db, organizationId, holder.vehicleId!);

  return `Техник ${vehicle.mineNumber ?? vehicle.name}`;
};

export const ensureFuelSettings = async (db: DbOrTx, organizationId: string) => {
  const [existing] = await db
    .select()
    .from(fuelSettings)
    .where(eq(fuelSettings.organizationId, organizationId))
    .limit(1);

  if (existing) {
    return existing;
  }

  await db.insert(fuelSettings).values({ organizationId }).onConflictDoNothing();

  const [created] = await db
    .select()
    .from(fuelSettings)
    .where(eq(fuelSettings.organizationId, organizationId))
    .limit(1);

  if (!created) {
    throw new Error('Түлшний тохиргоо үүсгэж чадсангүй.');
  }

  return created;
};