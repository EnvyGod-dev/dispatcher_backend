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
 * Түгээгч (түлшний) машин: тохиргоонд isFuelDispenser гэж тэмдэглэсэн, эсвэл парк дугаар нь
 * "ST"-ээр эхэлсэн техник (уурхайн түлшний машинууд ST860, ST861 гэх мэт).
 */
export const DISPENSER_PREFIX = 'ST';

export const isDispenserVehicle = (vehicle: { isFuelDispenser: boolean | null; mineNumber: string | null; code: string | null }) =>
  !!vehicle.isFuelDispenser ||
  (vehicle.mineNumber ?? '').trim().toUpperCase().startsWith(DISPENSER_PREFIX) ||
  (vehicle.code ?? '').trim().toUpperCase().startsWith(DISPENSER_PREFIX);

export const dispenserVehicleCondition = () =>
  sql`(${vehicles.isFuelDispenser} = true OR upper(trim(${vehicles.mineNumber})) LIKE ${`${DISPENSER_PREFIX}%`} OR upper(trim(${vehicles.code})) LIKE ${`${DISPENSER_PREFIX}%`})`;

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
    const vehicle = await getDispenserVehicle(db, organizationId, holder.vehicleId!);

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