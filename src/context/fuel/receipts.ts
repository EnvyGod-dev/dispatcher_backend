import { drizzleDb } from '$/libs/database/db';

import {
  fuelReceiptEditRequests,
  fuelReceipts,
  fuelSuppliers,
  fuelTanks,
  users,
} from '$/libs/database/schema';

import {
  and,
  desc,
  eq,
  gte,
  isNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  type Tx,
  type Holder,
  L,
  toNumber,
  toNumberOrNull,
  round,
  toNumeric,
  now,
  toOperationalDate,
  isUniqueViolation,
  assertPositive,
  insertAudit,
  requireRow,
} from './common';

import {
  getOrgTank,
  getOrgSupplier,
  assertOrgUser,
  ensureFuelSettings,
} from './lookups';

import {
  lockHolders,
  assertWithdrawable,
  assertCapacity,
  assertAfterOpening,
  insertLedger,
} from './ledger';

import {
  sendFuelReceiptActEmail,
} from './act-email';

const generateActNumber = async (tx: Tx, organizationId: string, receivedAt: string) => {
  const settings = await ensureFuelSettings(tx, organizationId);
  const year = toOperationalDate(receivedAt).slice(0, 4);
  const prefix = `${settings.actNumberPrefix}-${year}-`;

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`fuel:act:${organizationId}:${year}`}))`);

  const [row] = await tx
    .select({
      max: sql<number | null>`MAX(NULLIF(substring(${fuelReceipts.actNumber} from '([0-9]+)$'), '')::int)`,
    })
    .from(fuelReceipts)
    .where(and(eq(fuelReceipts.organizationId, organizationId), sql`${fuelReceipts.actNumber} LIKE ${`${prefix}%`}`));

  return `${prefix}${String((row?.max ?? 0) + 1).padStart(4, '0')}`;
};

type CreateReceiptInput = {
  organizationId: string;
  tankId: string;
  supplierId: string;
  fuelType?: 'diesel' | 'gasoline';
  quantity: string | number;
  receivedAt: string;
  operationalDate?: string;
  documentNumber?: string | null;
  transportVehicleNumber?: string | null;
  receivedBy: string;
  attachmentUrls?: string[];
  actNumber?: string | null;
  actSource?: 'generated' | 'uploaded';
  actFileUrl?: string | null;
  notes?: string | null;
  createdBy: string;
};

export const createFuelReceipt = async (input: CreateReceiptInput) => {
  assertPositive(input.quantity);

  const quantity = round(toNumber(input.quantity));
  const actSource = input.actSource ?? 'generated';

  if (actSource === 'uploaded' && !input.actFileUrl) {
    throw new Error('Гараар бэлтгэсэн АКТ-ын файлыг хавсаргана уу.');
  }

  let receipt: typeof fuelReceipts.$inferSelect;

  try {
    receipt = await drizzleDb.transaction(async (tx) => {
      const tank = await getOrgTank(tx, input.organizationId, input.tankId);

      await getOrgSupplier(tx, input.organizationId, input.supplierId);
      await assertOrgUser(tx, input.organizationId, input.receivedBy, 'Хүлээн авсан ажилтан');

      if (input.fuelType && input.fuelType !== tank.fuelType) {
        throw new Error(`${tank.name}: агуулахын түлшний төрөл тохирохгүй байна.`);
      }

      const holder: Holder = { holderType: 'tank', tankId: tank.id };

      await lockHolders(tx, input.organizationId, [holder]);
      await assertAfterOpening(tx, input.organizationId, holder, input.receivedAt, tank.name);
      await assertCapacity(tx, input.organizationId, holder, input.receivedAt, quantity, toNumberOrNull(tank.capacity), tank.name);

      const actNumber = input.actNumber?.trim() || (await generateActNumber(tx, input.organizationId, input.receivedAt));
      const operationalDate = input.operationalDate ?? toOperationalDate(input.receivedAt);

      const created = requireRow(await tx
        .insert(fuelReceipts)
        .values({
          organizationId: input.organizationId,
          tankId: tank.id,
          supplierId: input.supplierId,
          fuelType: tank.fuelType,
          quantity: toNumeric(quantity),
          receivedAt: input.receivedAt,
          operationalDate,
          documentNumber: input.documentNumber ?? null,
          transportVehicleNumber: input.transportVehicleNumber ?? null,
          receivedBy: input.receivedBy,
          attachmentUrls: input.attachmentUrls ?? [],
          actNumber,
          actSource,
          actFileUrl: input.actFileUrl ?? null,
          emailStatus: 'pending',
          notes: input.notes ?? null,
          createdBy: input.createdBy,
        })
        .returning());

      await insertLedger(tx, input.organizationId, [
        {
          holder,
          entryType: 'receipt',
          delta: quantity,
          occurredAt: input.receivedAt,
          operationalDate,
          receiptId: created.id,
        },
      ]);

      await insertAudit(tx, {
        organizationId: input.organizationId,
        entityType: 'fuel_receipt',
        entityId: created.id,
        action: 'create',
        after: created,
        userId: input.createdBy,
      });

      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('Энэ АКТ дугаар бүртгэгдсэн байна.');
    }

    throw error;
  }

  if (receipt.actFileUrl) {
    void sendFuelReceiptActEmail({
      organizationId: input.organizationId,
      receiptId: receipt.id,
      triggeredBy: input.createdBy,
    }).catch(() => undefined);
  }

  return receipt;
};

export const setFuelReceiptActFile = async (
  organizationId: string,
  receiptId: string,
  actFileUrl: string,
  userId?: string | null,
  sendEmail = true,
) => {
  const [receipt] = await drizzleDb
    .update(fuelReceipts)
    .set({ actFileUrl, updatedAt: now() })
    .where(and(eq(fuelReceipts.id, receiptId), eq(fuelReceipts.organizationId, organizationId)))
    .returning();

  if (!receipt) {
    throw new Error('Орлогын бүртгэл олдсонгүй.');
  }

  if (sendEmail && !receipt.cancelledAt) {
    await sendFuelReceiptActEmail({ organizationId, receiptId, triggeredBy: userId ?? null }).catch(() => undefined);
  }

  return receipt;
};

export const getFuelReceipts = async (
  organizationId: string,
  input?: {
    from?: string;
    to?: string;
    tankId?: string;
    supplierId?: string;
    emailStatus?: 'pending' | 'sent' | 'failed';
    includeCancelled?: boolean;
  },
) => {
  const conditions: SQL[] = [eq(fuelReceipts.organizationId, organizationId)];

  if (input?.from) {
    conditions.push(gte(fuelReceipts.operationalDate, input.from));
  }

  if (input?.to) {
    conditions.push(lte(fuelReceipts.operationalDate, input.to));
  }

  if (input?.tankId) {
    conditions.push(eq(fuelReceipts.tankId, input.tankId));
  }

  if (input?.supplierId) {
    conditions.push(eq(fuelReceipts.supplierId, input.supplierId));
  }

  if (input?.emailStatus) {
    conditions.push(eq(fuelReceipts.emailStatus, input.emailStatus));
  }

  if (input?.includeCancelled === false) {
    conditions.push(isNull(fuelReceipts.cancelledAt));
  }

  const rows = await drizzleDb
    .select({
      receipt: fuelReceipts,
      tankName: fuelTanks.name,
      supplierName: fuelSuppliers.name,
      receivedByName: sql<string | null>`COALESCE(${users.firstName}, ${users.name})`,
    })
    .from(fuelReceipts)
    .innerJoin(fuelTanks, eq(fuelTanks.id, fuelReceipts.tankId))
    .innerJoin(fuelSuppliers, eq(fuelSuppliers.id, fuelReceipts.supplierId))
    .leftJoin(users, eq(users.id, fuelReceipts.receivedBy))
    .where(and(...conditions))
    .orderBy(desc(fuelReceipts.receivedAt));

  return rows.map((r) => ({
    ...r.receipt,
    tankName: r.tankName,
    supplierName: r.supplierName,
    receivedByName: r.receivedByName,
  }));
};

const RECEIPT_EDITABLE_FIELDS = [
  'tankId',
  'supplierId',
  'quantity',
  'receivedAt',
  'documentNumber',
  'transportVehicleNumber',
  'receivedBy',
  'attachmentUrls',
  'actFileUrl',
  'notes',
] as const;

type ReceiptChanges = Partial<{
  tankId: string;
  supplierId: string;
  quantity: string | number;
  receivedAt: string;
  documentNumber: string | null;
  transportVehicleNumber: string | null;
  receivedBy: string;
  attachmentUrls: string[];
  actFileUrl: string | null;
  notes: string | null;
}>;

const pickReceiptChanges = (changes: Record<string, unknown>): ReceiptChanges => {
  const result: Record<string, unknown> = {};

  for (const key of RECEIPT_EDITABLE_FIELDS) {
    if (changes[key] !== undefined) {
      result[key] = changes[key];
    }
  }

  return result as ReceiptChanges;
};

export const createFuelReceiptEditRequest = async (input: {
  organizationId: string;
  receiptId: string;
  type: 'update' | 'cancel';
  changes?: Record<string, unknown>;
  reason: string;
  requestedBy: string;
}) => {
  if (!input.reason?.trim()) {
    throw new Error('Шалтгаан бичнэ үү.');
  }

  const [receipt] = await drizzleDb
    .select()
    .from(fuelReceipts)
    .where(and(eq(fuelReceipts.id, input.receiptId), eq(fuelReceipts.organizationId, input.organizationId)))
    .limit(1);

  if (!receipt) {
    throw new Error('Орлогын бүртгэл олдсонгүй.');
  }

  if (receipt.cancelledAt) {
    throw new Error('Цуцлагдсан орлогыг засах боломжгүй.');
  }

  const changes = input.type === 'update' ? pickReceiptChanges(input.changes ?? {}) : {};

  if (input.type === 'update' && Object.keys(changes).length === 0) {
    throw new Error('Өөрчлөх талбар оруулна уу.');
  }

  if (changes.quantity !== undefined) {
    assertPositive(changes.quantity, 'Шинэ хэмжээ 0-ээс их байх ёстой.');
  }

  try {
    const request = requireRow(await drizzleDb
      .insert(fuelReceiptEditRequests)
      .values({
        organizationId: input.organizationId,
        receiptId: input.receiptId,
        type: input.type,
        changes,
        reason: input.reason.trim(),
        status: 'pending',
        requestedBy: input.requestedBy,
      })
      .returning());

    await insertAudit(drizzleDb, {
      organizationId: input.organizationId,
      entityType: 'fuel_receipt_edit_request',
      entityId: request.id,
      action: 'request',
      after: request,
      userId: input.requestedBy,
    });

    return request;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('Энэ орлогод шийдвэрлэгдээгүй хүсэлт байна.');
    }

    throw error;
  }
};

export const getFuelReceiptEditRequests = async (
  organizationId: string,
  status?: 'pending' | 'approved' | 'rejected',
) => {
  const conditions: SQL[] = [eq(fuelReceiptEditRequests.organizationId, organizationId)];

  if (status) {
    conditions.push(eq(fuelReceiptEditRequests.status, status));
  }

  const rows = await drizzleDb
    .select({
      request: fuelReceiptEditRequests,
      actNumber: fuelReceipts.actNumber,
      receiptQuantity: fuelReceipts.quantity,
      receiptReceivedAt: fuelReceipts.receivedAt,
      requestedByName: sql<string | null>`COALESCE(${users.firstName}, ${users.name})`,
    })
    .from(fuelReceiptEditRequests)
    .innerJoin(fuelReceipts, eq(fuelReceipts.id, fuelReceiptEditRequests.receiptId))
    .leftJoin(users, eq(users.id, fuelReceiptEditRequests.requestedBy))
    .where(and(...conditions))
    .orderBy(desc(fuelReceiptEditRequests.createdAt));

  return rows.map((r) => ({
    ...r.request,
    actNumber: r.actNumber,
    receiptQuantity: r.receiptQuantity,
    receiptReceivedAt: r.receiptReceivedAt,
    requestedByName: r.requestedByName,
  }));
};

export const reviewFuelReceiptEditRequest = async (input: {
  organizationId: string;
  requestId: string;
  approved: boolean;
  reviewedBy: string;
  reviewerRole?: string | null;
  reviewNote?: string | null;
}) => {
  return drizzleDb.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(fuelReceiptEditRequests)
      .where(
        and(
          eq(fuelReceiptEditRequests.id, input.requestId),
          eq(fuelReceiptEditRequests.organizationId, input.organizationId),
        ),
      )
      .for('update')
      .limit(1);

    if (!request) {
      throw new Error('Хүсэлт олдсонгүй.');
    }

    if (request.status !== 'pending') {
      throw new Error('Хүсэлт аль хэдийн шийдвэрлэгдсэн байна.');
    }

    if (input.approved && request.requestedBy === input.reviewedBy && input.reviewerRole !== 'admin') {
      throw new Error('Өөрийн илгээсэн хүсэлтийг өөрөө батлах боломжгүй.');
    }

    const [updatedRequest] = await tx
      .update(fuelReceiptEditRequests)
      .set({
        status: input.approved ? 'approved' : 'rejected',
        reviewedBy: input.reviewedBy,
        reviewedAt: now(),
        reviewNote: input.reviewNote ?? null,
        updatedAt: now(),
      })
      .where(eq(fuelReceiptEditRequests.id, request.id))
      .returning();

    if (!input.approved) {
      await insertAudit(tx, {
        organizationId: input.organizationId,
        entityType: 'fuel_receipt_edit_request',
        entityId: request.id,
        action: 'reject',
        after: updatedRequest,
        userId: input.reviewedBy,
      });

      return updatedRequest;
    }

    const [receipt] = await tx
      .select()
      .from(fuelReceipts)
      .where(and(eq(fuelReceipts.id, request.receiptId), eq(fuelReceipts.organizationId, input.organizationId)))
      .for('update')
      .limit(1);

    if (!receipt) {
      throw new Error('Орлогын бүртгэл олдсонгүй.');
    }

    if (receipt.cancelledAt) {
      throw new Error('Орлого аль хэдийн цуцлагдсан байна.');
    }

    const oldHolder: Holder = { holderType: 'tank', tankId: receipt.tankId };
    let after = receipt;

    if (request.type === 'cancel') {
      await lockHolders(tx, input.organizationId, [oldHolder]);

      const [tank] = await tx.select({ name: fuelTanks.name }).from(fuelTanks).where(eq(fuelTanks.id, receipt.tankId));

      await assertWithdrawable(
        tx,
        input.organizationId,
        oldHolder,
        receipt.receivedAt,
        toNumber(receipt.quantity),
        tank?.name ?? 'Агуулах',
      );

      await tx.delete(L).where(and(eq(L.receiptId, receipt.id), eq(L.entryType, 'receipt')));

      after = requireRow(await tx
        .update(fuelReceipts)
        .set({
          cancelledAt: now(),
          cancelledBy: input.reviewedBy,
          cancelReason: request.reason,
          updatedAt: now(),
        })
        .where(eq(fuelReceipts.id, receipt.id))
        .returning());
    } else {
      const changes = pickReceiptChanges(request.changes as Record<string, unknown>);
      const tankId = changes.tankId ?? receipt.tankId;
      const quantity = round(changes.quantity !== undefined ? toNumber(changes.quantity) : toNumber(receipt.quantity));
      const receivedAt = changes.receivedAt ?? receipt.receivedAt;
      const operationalDate = toOperationalDate(receivedAt);

      if (quantity <= 0) {
        throw new Error('Шинэ хэмжээ 0-ээс их байх ёстой.');
      }

      const tank = await getOrgTank(tx, input.organizationId, tankId, !!changes.tankId);

      if (changes.supplierId) {
        await getOrgSupplier(tx, input.organizationId, changes.supplierId);
      }

      if (changes.receivedBy) {
        await assertOrgUser(tx, input.organizationId, changes.receivedBy, 'Хүлээн авсан ажилтан');
      }

      const newHolder: Holder = { holderType: 'tank', tankId };

      await lockHolders(tx, input.organizationId, [oldHolder, newHolder]);
      await tx.delete(L).where(and(eq(L.receiptId, receipt.id), eq(L.entryType, 'receipt')));

      await assertAfterOpening(tx, input.organizationId, newHolder, receivedAt, tank.name);

      await insertLedger(tx, input.organizationId, [
        {
          holder: newHolder,
          entryType: 'receipt',
          delta: quantity,
          occurredAt: receivedAt,
          operationalDate,
          receiptId: receipt.id,
        },
      ]);

      const earliest = new Date(receipt.receivedAt).getTime() < new Date(receivedAt).getTime() ? receipt.receivedAt : receivedAt;
      const checkAt = new Date(new Date(earliest).getTime() - 1).toISOString();

      await assertWithdrawable(tx, input.organizationId, oldHolder, checkAt, 0, 'Агуулах');
      await assertCapacity(tx, input.organizationId, newHolder, checkAt, 0, toNumberOrNull(tank.capacity), tank.name);

      after = requireRow(await tx
        .update(fuelReceipts)
        .set({
          tankId,
          supplierId: changes.supplierId ?? receipt.supplierId,
          fuelType: tank.fuelType,
          quantity: toNumeric(quantity),
          receivedAt,
          operationalDate,
          ...(changes.documentNumber !== undefined && { documentNumber: changes.documentNumber }),
          ...(changes.transportVehicleNumber !== undefined && { transportVehicleNumber: changes.transportVehicleNumber }),
          ...(changes.receivedBy !== undefined && { receivedBy: changes.receivedBy }),
          ...(changes.attachmentUrls !== undefined && { attachmentUrls: changes.attachmentUrls }),
          ...(changes.actFileUrl !== undefined && { actFileUrl: changes.actFileUrl }),
          ...(changes.notes !== undefined && { notes: changes.notes }),
          updatedAt: now(),
        })
        .where(eq(fuelReceipts.id, receipt.id))
        .returning());
    }

    await insertAudit(tx, {
      organizationId: input.organizationId,
      entityType: 'fuel_receipt',
      entityId: receipt.id,
      action: request.type === 'cancel' ? 'cancel' : 'update',
      before: receipt,
      after,
      userId: input.reviewedBy,
    });

    await insertAudit(tx, {
      organizationId: input.organizationId,
      entityType: 'fuel_receipt_edit_request',
      entityId: request.id,
      action: 'approve',
      after: updatedRequest,
      userId: input.reviewedBy,
    });

    return updatedRequest;
  });
};