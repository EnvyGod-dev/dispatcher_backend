import { drizzleDb } from '$/libs/database/db';

import {
  fuelAlerts,
  organizations,
  users,
  vehicles,
} from '$/libs/database/schema';

import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  escapeHtml,
  sendMail,
} from './adapters';

import {
  type AlertMetric,
  toNumber,
  toNumeric,
  now,
  todayUB,
  addDays,
  errorMessage,
  insertAudit,
} from './common';

import {
  ensureFuelSettings,
} from './lookups';

import {
  getFuelNotificationRecipients,
} from './settings';

import {
  type ConsumptionRow,
  computeFuelConsumption,
} from './consumption';

const METRIC_LABEL: Record<AlertMetric, string> = {
  liters_per_trip: 'л/рейс',
  liters_per_m3: 'л/м3',
};

const AUTO_CLOSE_REASON = 'Дахин тооцоход босгоос доош орсон тул автоматаар хаагдав.';

export const evaluateFuelAlerts = async (
  organizationId: string,
  options: { periodEnd?: string; windowDays?: number; notify?: boolean } = {},
) => {
  const settings = await ensureFuelSettings(drizzleDb, organizationId);
  const windowDays = options.windowDays ?? settings.alertWindowDays;

  if (windowDays < 1 || windowDays > 31) {
    throw new Error('Тооцох цонх 1–31 хоног байна.');
  }

  const periodEnd = options.periodEnd ?? addDays(todayUB(), -1);
  const periodStart = addDays(periodEnd, -(windowDays - 1));
  const { rows } = await computeFuelConsumption(organizationId, periodStart, periodEnd);

  const existing = await drizzleDb
    .select()
    .from(fuelAlerts)
    .where(
      and(
        eq(fuelAlerts.organizationId, organizationId),
        eq(fuelAlerts.periodStart, periodStart),
        eq(fuelAlerts.periodEnd, periodEnd),
      ),
    );

  const existingBy = new Map(existing.map((a) => [`${a.vehicleId}|${a.metric}`, a]));
  const candidates: { row: ConsumptionRow; metric: AlertMetric }[] = [];

  for (const row of rows) {
    if (row.perTrip.exceeds) {
      candidates.push({ row, metric: 'liters_per_trip' });
    }

    if (row.perM3.exceeds) {
      candidates.push({ row, metric: 'liters_per_m3' });
    }
  }

  const exceedingKeys = new Set(candidates.map((c) => `${c.row.vehicleId}|${c.metric}`));
  const created: (typeof fuelAlerts.$inferSelect)[] = [];
  let updated = 0;
  let autoClosed = 0;

  await drizzleDb.transaction(async (tx) => {
    for (const { row, metric } of candidates) {
      const m = metric === 'liters_per_trip' ? row.perTrip : row.perM3;
      const values = {
        vehicleModel: row.groupKey,
        actualValue: toNumeric(m.actual!, 4),
        averageValue: toNumeric(m.baseline!, 4),
        baselineSource: m.baselineSource!,
        deviationPercent: toNumeric(m.deviationPercent!),
        thresholdPercent: toNumeric(row.thresholdPercent),
        totalRefueled: toNumeric(row.totalRefueled),
        tripCount: row.tripCount,
        volumeM3: toNumeric(row.volumeM3),
      };

      const previous = existingBy.get(`${row.vehicleId}|${metric}`);

      if (!previous) {
        const [alert] = await tx
          .insert(fuelAlerts)
          .values({
            organizationId,
            vehicleId: row.vehicleId,
            periodStart,
            periodEnd,
            metric,
            ...values,
          })
          .onConflictDoNothing()
          .returning();

        if (alert) {
          created.push(alert);
        }
      } else if (previous.status === 'open') {
        await tx
          .update(fuelAlerts)
          .set({ ...values, updatedAt: now() })
          .where(eq(fuelAlerts.id, previous.id));

        updated += 1;
      }
    }

    const toClose = existing.filter((a) => a.status === 'open' && !exceedingKeys.has(`${a.vehicleId}|${a.metric}`));

    if (toClose.length > 0) {
      await tx
        .update(fuelAlerts)
        .set({ status: 'closed', closedAt: now(), closeReason: AUTO_CLOSE_REASON, updatedAt: now() })
        .where(inArray(fuelAlerts.id, toClose.map((a) => a.id)));

      autoClosed = toClose.length;
    }
  });

  if (options.notify !== false && created.length > 0) {
    await notifyFuelAlerts(organizationId, created.map((a) => a.id));
  }

  return {
    periodStart,
    periodEnd,
    evaluatedVehicles: rows.length,
    created: created.length,
    updated,
    autoClosed,
  };
};

export const notifyFuelAlerts = async (organizationId: string, alertIds: string[]) => {
  if (alertIds.length === 0) {
    return;
  }

  const settings = await ensureFuelSettings(drizzleDb, organizationId);

  if (!settings.alertEmailEnabled) {
    return;
  }

  const [organization] = await drizzleDb
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId));

  const alerts = await drizzleDb
    .select({ alert: fuelAlerts, mineNumber: vehicles.mineNumber, vehicleName: vehicles.name })
    .from(fuelAlerts)
    .innerJoin(vehicles, eq(vehicles.id, fuelAlerts.vehicleId))
    .where(and(eq(fuelAlerts.organizationId, organizationId), inArray(fuelAlerts.id, alertIds)))
    .orderBy(desc(fuelAlerts.deviationPercent));

  const head = alerts[0];

  if (!head) {
    return;
  }

  const first = head.alert;
  const period = first.periodStart === first.periodEnd ? first.periodEnd : `${first.periodStart} – ${first.periodEnd}`;
  let notificationError: string | null = null;

  try {
    const recipients = await getFuelNotificationRecipients(organizationId, 'alert');
    let to = recipients.filter((r) => !r.isCc).map((r) => r.email);
    let cc = recipients.filter((r) => r.isCc).map((r) => r.email);

    if (to.length === 0 && cc.length > 0) {
      to = cc.slice(0, 1);
      cc = cc.slice(1);
    }

    if (to.length === 0) {
      throw new Error('Alert хүлээн авах и-мэйл тохируулагдаагүй байна.');
    }

    const rowsHtml = alerts
      .map(
        ({ alert, mineNumber, vehicleName }) => `
          <tr>
            <td>${escapeHtml(mineNumber ?? vehicleName)}</td>
            <td>${escapeHtml(alert.vehicleModel)}</td>
            <td>${METRIC_LABEL[alert.metric]}</td>
            <td style="text-align:right">${toNumber(alert.actualValue).toFixed(2)}</td>
            <td style="text-align:right">${toNumber(alert.averageValue).toFixed(2)}</td>
            <td style="text-align:right;color:#c0392b"><b>+${toNumber(alert.deviationPercent).toFixed(1)}%</b></td>
          </tr>`,
      )
      .join('');

    await sendMail({
      to,
      cc,
      subject: `Түлшний норм хэтрэлт – ${alerts.length} техник (${period})`,
      html: `
        <p>${escapeHtml(organization?.name)} – ${period} үеийн түлшний зарцуулалт ижил төрлийн техникийн дунджаас хэтэрсэн байна.</p>
        <table cellpadding="6" border="1" style="border-collapse:collapse;border-color:#ccc">
          <tr>
            <th>Парк №</th>
            <th>Загвар</th>
            <th>Үзүүлэлт</th>
            <th>Бодит</th>
            <th>Дундаж</th>
            <th>Хэтрэлт</th>
          </tr>
          ${rowsHtml}
        </table>
        <p>Системд нэвтэрч шалтгааныг тайлбарлан хаана уу.</p>
      `,
    });
  } catch (error) {
    notificationError = errorMessage(error);
  }

  await drizzleDb
    .update(fuelAlerts)
    .set({ notifiedAt: now(), notificationError, updatedAt: now() })
    .where(inArray(fuelAlerts.id, alertIds));
};

export const getFuelAlerts = async (
  organizationId: string,
  status?: 'open' | 'closed',
  filter?: { from?: string; to?: string; vehicleId?: string; metric?: AlertMetric },
) => {
  const conditions: SQL[] = [eq(fuelAlerts.organizationId, organizationId)];

  if (status) {
    conditions.push(eq(fuelAlerts.status, status));
  }

  if (filter?.from) {
    conditions.push(gte(fuelAlerts.periodEnd, filter.from));
  }

  if (filter?.to) {
    conditions.push(lte(fuelAlerts.periodEnd, filter.to));
  }

  if (filter?.vehicleId) {
    conditions.push(eq(fuelAlerts.vehicleId, filter.vehicleId));
  }

  if (filter?.metric) {
    conditions.push(eq(fuelAlerts.metric, filter.metric));
  }

  const rows = await drizzleDb
    .select({
      alert: fuelAlerts,
      mineNumber: vehicles.mineNumber,
      vehicleName: vehicles.name,
      closedByName: sql<string | null>`COALESCE(${users.firstName}, ${users.name})`,
    })
    .from(fuelAlerts)
    .innerJoin(vehicles, eq(vehicles.id, fuelAlerts.vehicleId))
    .leftJoin(users, eq(users.id, fuelAlerts.closedBy))
    .where(and(...conditions))
    .orderBy(desc(fuelAlerts.periodEnd), desc(fuelAlerts.deviationPercent));

  return rows.map((r) => ({
    ...r.alert,
    mineNumber: r.mineNumber,
    vehicleName: r.vehicleName,
    closedByName: r.closedByName,
  }));
};

export const closeFuelAlert = async (organizationId: string, id: string, userId: string, reason: string) => {
  if (!reason?.trim()) {
    throw new Error('Alert хаах шалтгаан шаардлагатай.');
  }

  return drizzleDb.transaction(async (tx) => {
    const [alert] = await tx
      .select()
      .from(fuelAlerts)
      .where(and(eq(fuelAlerts.id, id), eq(fuelAlerts.organizationId, organizationId)))
      .for('update')
      .limit(1);

    if (!alert) {
      return null;
    }

    if (alert.status === 'closed') {
      throw new Error('Alert аль хэдийн хаагдсан байна.');
    }

    const [closed] = await tx
      .update(fuelAlerts)
      .set({
        status: 'closed',
        closedBy: userId,
        closedAt: now(),
        closeReason: reason.trim(),
        updatedAt: now(),
      })
      .where(eq(fuelAlerts.id, id))
      .returning();

    await insertAudit(tx, {
      organizationId,
      entityType: 'fuel_alert',
      entityId: id,
      action: 'close',
      before: alert,
      after: closed,
      userId,
    });

    return closed;
  });
};