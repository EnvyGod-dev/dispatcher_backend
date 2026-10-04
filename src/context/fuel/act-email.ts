import { drizzleDb } from '$/libs/database/db';

import {
  fuelReceiptEmailLogs,
  fuelReceipts,
  fuelSuppliers,
  fuelTanks,
} from '$/libs/database/schema';

import {
  and,
  desc,
  eq,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';

import {
  downloadFile,
  escapeHtml,
  sendMail,
} from './adapters';

import {
  now,
  errorMessage,
} from './common';

import {
  getFuelNotificationRecipients,
} from './settings';

export const sendFuelReceiptActEmail = async (input: {
  organizationId: string;
  receiptId: string;
  triggeredBy?: string | null;
}) => {
  const [row] = await drizzleDb
    .select({
      receipt: fuelReceipts,
      tankName: fuelTanks.name,
      supplierName: fuelSuppliers.name,
    })
    .from(fuelReceipts)
    .innerJoin(fuelTanks, eq(fuelTanks.id, fuelReceipts.tankId))
    .innerJoin(fuelSuppliers, eq(fuelSuppliers.id, fuelReceipts.supplierId))
    .where(and(eq(fuelReceipts.id, input.receiptId), eq(fuelReceipts.organizationId, input.organizationId)))
    .limit(1);

  if (!row) {
    throw new Error('Орлогын бүртгэл олдсонгүй.');
  }

  const receipt = row.receipt;
  const recipients = await getFuelNotificationRecipients(input.organizationId, 'act');
  let to = recipients.filter((x) => !x.isCc).map((x) => x.email);
  let cc = recipients.filter((x) => x.isCc).map((x) => x.email);

  if (to.length === 0 && cc.length > 0) {
    to = cc.slice(0, 1);
    cc = cc.slice(1);
  }

  try {
    if (to.length === 0) {
      throw new Error('АКТ хүлээн авах үндсэн и-мэйл тохируулагдаагүй байна.');
    }

    if (!receipt.cancelledAt && !receipt.actFileUrl) {
      throw new Error('АКТ файл байхгүй байна.');
    }

    const attachments =
      !receipt.cancelledAt && receipt.actFileUrl
        ? [
            {
              filename: `fuel-act-${receipt.actNumber}.pdf`,
              content: await downloadFile(receipt.actFileUrl),
              contentType: 'application/pdf',
            },
          ]
        : [];

    const title = receipt.cancelledAt ? `[ЦУЦЛАГДСАН] Түлш хүлээн авалтын АКТ №${receipt.actNumber}` : `Түлш хүлээн авалтын АКТ №${receipt.actNumber}`;

    await sendMail({
      to,
      cc,
      subject: title,
      html: `
        <p>Сайн байна уу.</p>
        <p>${
          receipt.cancelledAt
            ? `Доорх түлшний орлого цуцлагдсан болохыг мэдэгдье. Шалтгаан: ${escapeHtml(receipt.cancelReason)}`
            : `Түлш хүлээн авалтын АКТ <strong>№${escapeHtml(receipt.actNumber)}</strong> хавсралтаар илгээгдлээ.`
        }</p>
        <table cellpadding="6" style="border-collapse:collapse;border:1px solid #ccc">
          <tr><td><b>Огноо</b></td><td>${escapeHtml(receipt.operationalDate)}</td></tr>
          <tr><td><b>Агуулах</b></td><td>${escapeHtml(row.tankName)}</td></tr>
          <tr><td><b>Нийлүүлэгч</b></td><td>${escapeHtml(row.supplierName)}</td></tr>
          <tr><td><b>Хэмжээ</b></td><td>${escapeHtml(String(receipt.quantity))} литр</td></tr>
          <tr><td><b>Накладной №</b></td><td>${escapeHtml(receipt.documentNumber ?? '—')}</td></tr>
          <tr><td><b>Тээврийн хэрэгсэл</b></td><td>${escapeHtml(receipt.transportVehicleNumber ?? '—')}</td></tr>
        </table>
      `,
      attachments,
    });

    await drizzleDb.transaction(async (tx) => {
      await tx
        .update(fuelReceipts)
        .set({ emailStatus: 'sent', emailSentAt: now(), updatedAt: now() })
        .where(eq(fuelReceipts.id, receipt.id));

      await tx.insert(fuelReceiptEmailLogs).values({
        organizationId: input.organizationId,
        receiptId: receipt.id,
        toEmails: to,
        ccEmails: cc,
        status: 'sent',
        triggeredBy: input.triggeredBy ?? null,
        sentAt: now(),
      });
    });

    return { success: true };
  } catch (error) {
    await drizzleDb.transaction(async (tx) => {
      await tx
        .update(fuelReceipts)
        .set({ emailStatus: 'failed', updatedAt: now() })
        .where(eq(fuelReceipts.id, receipt.id));

      await tx.insert(fuelReceiptEmailLogs).values({
        organizationId: input.organizationId,
        receiptId: receipt.id,
        toEmails: to,
        ccEmails: cc,
        status: 'failed',
        errorMessage: errorMessage(error),
        triggeredBy: input.triggeredBy ?? null,
      });
    });

    throw error;
  }
};

export const getFuelReceiptEmailLogs = async (organizationId: string, receiptId: string) => {
  return drizzleDb
    .select()
    .from(fuelReceiptEmailLogs)
    .where(and(eq(fuelReceiptEmailLogs.organizationId, organizationId), eq(fuelReceiptEmailLogs.receiptId, receiptId)))
    .orderBy(desc(fuelReceiptEmailLogs.createdAt));
};

export const retryFailedFuelActEmails = async (organizationId: string) => {
  const failed = await drizzleDb
    .select({ id: fuelReceipts.id })
    .from(fuelReceipts)
    .where(
      and(
        eq(fuelReceipts.organizationId, organizationId),
        eq(fuelReceipts.emailStatus, 'failed'),
        isNull(fuelReceipts.cancelledAt),
        isNotNull(fuelReceipts.actFileUrl),
        sql`${fuelReceipts.receivedAt} > now() - interval '7 days'`,
      ),
    );

  let sent = 0;

  for (const { id } of failed) {
    try {
      await sendFuelReceiptActEmail({ organizationId, receiptId: id, triggeredBy: null });
      sent += 1;
    } catch {
      continue;
    }
  }

  return { attempted: failed.length, sent };
};