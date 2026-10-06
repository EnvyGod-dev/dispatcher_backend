import { drizzleDb } from '$/libs/database/db';

import {
  fuelIssues,
  fuelTanks,
  vehicles,
} from '$/libs/database/schema';

import {
  and,
  desc,
  eq,
  gte,
  lte,
  type SQL,
} from 'drizzle-orm';

import {
  type Holder,
  toNumberOrNull,
  round,
  toNumeric,
  toOperationalDate,
  assertPositive,
  insertAudit,
  requireRow,
} from './common';

import {
  getOrgTank,
  getDispenserVehicle,
  assertOrgUser,
} from './lookups';

import {
  advanceMeter,
  getMeterFor,
} from './meters';

import { resolveRefuelQuantity } from './refuelings';

import {
  lockHolders,
  assertWithdrawable,
  assertCapacity,
  assertAfterOpening,
  insertLedger,
} from './ledger';

type CreateIssueInput = {
  organizationId: string;
  tankId: string;
  dispenserVehicleId: string;
  quantity?: string | number | null;
  /** Агуулахын тоолуурын заалт (урд талын 0-уудтай string эсвэл тоо). */
  meterStart?: string | number | null;
  meterEnd?: string | number | null;
  issuedAt: string;
  operationalDate?: string;
  issuedBy: string;
  notes?: string | null;
  createdBy: string;
};

export const createFuelIssue = async (input: CreateIssueInput) => {
  if (input.quantity !== null && input.quantity !== undefined) {
    assertPositive(input.quantity);
  }

  return drizzleDb.transaction(async (tx) => {
    const tank = await getOrgTank(tx, input.organizationId, input.tankId);
    const dispenser = await getDispenserVehicle(tx, input.organizationId, input.dispenserVehicleId);

    await assertOrgUser(tx, input.organizationId, input.issuedBy, 'Олгосон ажилтан');

    const tankHolder: Holder = { holderType: 'tank', tankId: tank.id };
    // Агуулахын тоолуур бүртгэгдсэн бол заалтаар тооцож, одоогийн заалтыг шинэчилнэ.
    const meter = await getMeterFor(tx, input.organizationId, tankHolder);
    const { quantity: resolved, start, end } = resolveRefuelQuantity(input, meter?.digits);
    const quantity = round(resolved);
    const dispenserHolder: Holder = { holderType: 'dispenser', vehicleId: dispenser.id };
    const dispenserLabel = `Түгээх машин ${dispenser.mineNumber ?? dispenser.name}`;

    await lockHolders(tx, input.organizationId, [tankHolder, dispenserHolder]);
    await assertAfterOpening(tx, input.organizationId, tankHolder, input.issuedAt, tank.name);
    await assertAfterOpening(tx, input.organizationId, dispenserHolder, input.issuedAt, dispenserLabel);
    await assertWithdrawable(tx, input.organizationId, tankHolder, input.issuedAt, quantity, tank.name);
    await assertCapacity(
      tx,
      input.organizationId,
      dispenserHolder,
      input.issuedAt,
      quantity,
      toNumberOrNull(dispenser.dispenserCapacity),
      dispenserLabel,
    );

    const operationalDate = input.operationalDate ?? toOperationalDate(input.issuedAt);

    const issue = requireRow(await tx
      .insert(fuelIssues)
      .values({
        organizationId: input.organizationId,
        tankId: tank.id,
        dispenserVehicleId: dispenser.id,
        quantity: toNumeric(quantity),
        meterStart: start ? start.value.toString() : null,
        meterEnd: end ? end.value.toString() : null,
        meterStartReading: start?.text ?? null,
        meterEndReading: end?.text ?? null,
        issuedAt: input.issuedAt,
        operationalDate,
        issuedBy: input.issuedBy,
        notes: input.notes ?? null,
        createdBy: input.createdBy,
      })
      .returning());

    await insertLedger(tx, input.organizationId, [
      {
        holder: tankHolder,
        entryType: 'issue',
        delta: -quantity,
        occurredAt: input.issuedAt,
        operationalDate,
        issueId: issue.id,
      },
      {
        holder: dispenserHolder,
        entryType: 'issue',
        delta: quantity,
        occurredAt: input.issuedAt,
        operationalDate,
        issueId: issue.id,
      },
    ]);

    await advanceMeter(tx, meter, end, input.issuedAt, input.createdBy);

    await insertAudit(tx, {
      organizationId: input.organizationId,
      entityType: 'fuel_issue',
      entityId: issue.id,
      action: 'create',
      after: issue,
      userId: input.createdBy,
    });

    return issue;
  });
};

export const getFuelIssues = async (
  organizationId: string,
  input?: {
    from?: string;
    to?: string;
    tankId?: string;
    dispenserVehicleId?: string;
  },
) => {
  const conditions: SQL[] = [eq(fuelIssues.organizationId, organizationId)];

  if (input?.from) {
    conditions.push(gte(fuelIssues.operationalDate, input.from));
  }

  if (input?.to) {
    conditions.push(lte(fuelIssues.operationalDate, input.to));
  }

  if (input?.tankId) {
    conditions.push(eq(fuelIssues.tankId, input.tankId));
  }

  if (input?.dispenserVehicleId) {
    conditions.push(eq(fuelIssues.dispenserVehicleId, input.dispenserVehicleId));
  }

  const rows = await drizzleDb
    .select({
      issue: fuelIssues,
      tankName: fuelTanks.name,
      dispenserMineNumber: vehicles.mineNumber,
      dispenserName: vehicles.name,
    })
    .from(fuelIssues)
    .innerJoin(fuelTanks, eq(fuelTanks.id, fuelIssues.tankId))
    .innerJoin(vehicles, eq(vehicles.id, fuelIssues.dispenserVehicleId))
    .where(and(...conditions))
    .orderBy(desc(fuelIssues.issuedAt));

  return rows.map((r) => ({
    ...r.issue,
    tankName: r.tankName,
    dispenserMineNumber: r.dispenserMineNumber,
    dispenserName: r.dispenserName,
  }));
};