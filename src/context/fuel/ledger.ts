import {
  fuelOpeningBalances,
} from '$/libs/database/schema';

import {
  and,
  eq,
  gt,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  type Tx,
  type DbOrTx,
  type Holder,
  L,
  toNumber,
  toNumberOrNull,
  round,
  toNumeric,
  toOperationalDate,
} from './common';

export const holderConditions = (organizationId: string, holder: Holder): SQL[] => {
  const conditions: SQL[] = [eq(L.organizationId, organizationId), eq(L.holderType, holder.holderType)];

  if (holder.holderType === 'tank') {
    if (holder.tankId) {
      conditions.push(eq(L.tankId, holder.tankId));
    }
  } else if (holder.vehicleId) {
    conditions.push(eq(L.vehicleId, holder.vehicleId));
  }

  return conditions;
};

export const assertHolderId = (holder: Holder) => {
  if (holder.holderType === 'tank' && !holder.tankId) {
    throw new Error('Савны tankId шаардлагатай.');
  }

  if (holder.holderType !== 'tank' && !holder.vehicleId) {
    throw new Error('Техникийн vehicleId шаардлагатай.');
  }
};

const holderLockKey = (organizationId: string, holder: Holder) => {
  return holder.holderType === 'tank'
    ? `fuel:${organizationId}:tank:${holder.tankId}`
    : `fuel:${organizationId}:${holder.holderType}:${holder.vehicleId}`;
};

export const lockHolders = async (tx: Tx, organizationId: string, holders: Holder[]) => {
  const keys = [...new Set(holders.map((h) => holderLockKey(organizationId, h)))].sort();

  for (const key of keys) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  }
};

export const balanceOf = async (db: DbOrTx, organizationId: string, holder: Holder, at?: string): Promise<number> => {
  const conditions = holderConditions(organizationId, holder);

  if (at) {
    conditions.push(lte(L.occurredAt, at));
  }

  const [row] = await db
    .select({ balance: sql<string | null>`COALESCE(SUM(${L.delta}), 0)` })
    .from(L)
    .where(and(...conditions));

  return round(toNumber(row?.balance));
};

const windowStats = async (db: DbOrTx, organizationId: string, holder: Holder, at: string) => {
  const running = db
    .select({
      occurredAt: L.occurredAt,
      balance: sql<string>`SUM(${L.delta}) OVER (ORDER BY ${L.occurredAt}, ${L.createdAt}, ${L.id})`.as('balance'),
    })
    .from(L)
    .where(and(...holderConditions(organizationId, holder)))
    .as('running');

  const [future] = await db
    .select({
      min: sql<string | null>`MIN(${running.balance})`,
      max: sql<string | null>`MAX(${running.balance})`,
    })
    .from(running)
    .where(gt(running.occurredAt, at));

  const balanceAt = await balanceOf(db, organizationId, holder, at);

  return {
    balanceAt,
    futureMin: toNumberOrNull(future?.min),
    futureMax: toNumberOrNull(future?.max),
  };
};

export const assertWithdrawable = async (
  tx: Tx,
  organizationId: string,
  holder: Holder,
  at: string,
  amount: number,
  label: string,
) => {
  const { balanceAt, futureMin } = await windowStats(tx, organizationId, holder, at);
  const available = futureMin === null ? balanceAt : Math.min(balanceAt, futureMin);

  if (round(available - amount) < 0) {
    throw new Error(
      amount > 0
        ? `${label}: түлшний үлдэгдэл хүрэлцэхгүй байна. Боломжит: ${round(Math.max(available, 0))} л, шаардагдах: ${round(amount)} л.`
        : `${label}: энэ өөрчлөлтийн дараа үлдэгдэл сөрөг (${round(available)} л) болно.`,
    );
  }

  return available;
};

export const assertCapacity = async (
  tx: Tx,
  organizationId: string,
  holder: Holder,
  at: string,
  amount: number,
  capacity: number | null,
  label: string,
) => {
  if (capacity === null || capacity <= 0) {
    return;
  }

  const { balanceAt, futureMax } = await windowStats(tx, organizationId, holder, at);
  const peak = futureMax === null ? balanceAt : Math.max(balanceAt, futureMax);

  if (round(peak + amount) > capacity) {
    throw new Error(
      `${label}: багтаамж (${round(capacity)} л) хэтэрнэ. Одоогийн дээд үлдэгдэл ${round(peak)} л, нэмэх ${round(amount)} л.`,
    );
  }
};

export const assertAfterOpening = async (tx: Tx, organizationId: string, holder: Holder, at: string, label: string) => {
  const conditions: SQL[] = [
    eq(fuelOpeningBalances.organizationId, organizationId),
    eq(fuelOpeningBalances.holderType, holder.holderType),
    holder.holderType === 'tank'
      ? eq(fuelOpeningBalances.tankId, holder.tankId!)
      : eq(fuelOpeningBalances.vehicleId, holder.vehicleId!),
  ];

  const [opening] = await tx
    .select({ balanceAt: fuelOpeningBalances.balanceAt })
    .from(fuelOpeningBalances)
    .where(and(...conditions))
    .limit(1);

  if (opening && new Date(at).getTime() < new Date(opening.balanceAt).getTime()) {
    throw new Error(
      `${label}: гарааны үлдэгдэл ${toOperationalDate(opening.balanceAt)}-нд бүртгэгдсэн тул түүнээс өмнөх огноогоор бүртгэх боломжгүй.`,
    );
  }
};

type LedgerInsert = {
  holder: Holder;
  entryType: 'opening' | 'receipt' | 'issue' | 'refuel' | 'adjustment';
  delta: number;
  occurredAt: string;
  operationalDate: string;
  receiptId?: string;
  issueId?: string;
  refuelingId?: string;
  openingBalanceId?: string;
  measurementId?: string;
};

export const insertLedger = async (tx: Tx, organizationId: string, entries: LedgerInsert[]) => {
  if (entries.length === 0) {
    return;
  }

  await tx.insert(L).values(
    entries.map((e) => ({
      organizationId,
      holderType: e.holder.holderType,
      tankId: e.holder.holderType === 'tank' ? (e.holder.tankId ?? null) : null,
      vehicleId: e.holder.holderType === 'tank' ? null : (e.holder.vehicleId ?? null),
      entryType: e.entryType,
      delta: toNumeric(e.delta),
      occurredAt: e.occurredAt,
      operationalDate: e.operationalDate,
      receiptId: e.receiptId ?? null,
      issueId: e.issueId ?? null,
      refuelingId: e.refuelingId ?? null,
      openingBalanceId: e.openingBalanceId ?? null,
      measurementId: e.measurementId ?? null,
    })),
  );
};