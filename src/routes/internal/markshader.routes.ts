import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '$/utils/app-env';
import {
  createMarkshaderReport,
  deleteMarkShaderReport,
  getActualProductionByVehicleAndDate,
  getExcavatorsByDate,
  getMarkshaderReportById,
  getMarkshaderReports,
  getMarkshaderStats,
  updateMarkshaderReport,
} from '$/context/markshader-report';
import { parseMarkshaderExcel, generateMarkshaderExcel } from '$/context/markshader-report/excel';
import { rbac } from '$/middlewares/rbac.middleware';
import { drizzleDb } from '$/libs/database/db';
import { markshaderDailyReports, vehicles } from '$/libs/database/schema';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';

const markshaderRoutes = new Hono<AppEnv>()

  .get(
    '/reports',
    rbac({ roles: ['markscheider', 'admin', 'dispatcher'] }),
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number().default(25),
        offset: z.coerce.number().default(0),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    ),
    async (c) => {
      const input = c.req.valid('query');
      const user = c.get('currentUser');
      if (!user.organizationId) throw new HTTPException(403, { message: 'Unauthorized' });

      const reports = await getMarkshaderReports(
        { limit: input.limit, offset: input.offset },
        {
          organizationId: user.organizationId,
          startDate: input.startDate,
          endDate: input.endDate,
        }
      );

      const totalCount = reports[0]?.totalCount ?? 0;
      return c.json(reports, { headers: { 'X-Total-Count': totalCount.toString() } });
    }
  )

  // =====================
  // GET /report — Нэг тайлан
  // =====================
  .get(
    '/report',
    rbac({ roles: ['markscheider', 'admin', 'dispatcher'] }),
    zValidator('query', z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid('query');
      const user = c.get('currentUser');
      if (!user.organizationId) throw new HTTPException(403, { message: 'Unauthorized' });

      const report = await getMarkshaderReportById(id, user.organizationId);
      if (!report) throw new HTTPException(404, { message: 'Report not found' });

      return c.json(report);
    }
  )

  // =====================
  // POST /report — Тайлан үүсгэх
  // =====================
  .post(
    '/report',
    rbac({ roles: ['markscheider', 'admin'] }),
    zValidator(
      'json',
      z.object({
        reportDate: z.string(),
        vehicleId: z.string().uuid(),
        operatorId: z.string().uuid().optional(),
        masterId: z.string().uuid().optional(),
        blockNumbers: z.array(z.string()).optional(),
        markProduction: z.coerce.string().transform(v => v.trim() || null),
        disSoil: z.coerce.string().optional().transform(v => v?.trim() || null),
        disCoal: z.coerce.string().optional().transform(v => v?.trim() || null),
        disReisSoil: z.coerce.number().optional(),
        disReisCoal: z.coerce.number().optional(),
        disTotalProduction: z.coerce.string().optional().transform(v => v?.trim() || null),
        disCoefficient: z.coerce.string().optional().transform(v => v?.trim() || null),
        markDisDiscrepancy: z.coerce.string().optional().transform(v => v?.trim() || null),
        notes: z.string().optional(),
      })
    ),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');
      if (!user.organizationId) throw new HTTPException(403, { message: 'Unauthorized' });

      try {
        const report = await createMarkshaderReport({
          ...body,
          blockNumbers: body.blockNumbers ?? null,
          operatorId: body.operatorId ?? null,
          masterId: body.masterId ?? null,
          disSoil: body.disSoil ?? null,
          disCoal: body.disCoal ?? null,
          disReisSoil: body.disReisSoil ?? 0,
          disReisCoal: body.disReisCoal ?? 0,
          disTotalProduction: body.disTotalProduction ?? null,
          disCoefficient: body.disCoefficient ?? null,
          markDisDiscrepancy: body.markDisDiscrepancy ?? null,
          notes: body.notes ?? null,
          organizationId: user.organizationId,
          recordedBy: user.id,
        });
        return c.json(report, 201);
      } catch (err: unknown) {
        const pgErr = err as { code?: string };
        if (pgErr?.code === '23505') {
          throw new HTTPException(409, {
            message: 'Тэр өдөр, excavator, ээлжинд хэмжилт аль хэдийн бүртгэгдсэн байна',
          });
        }
        throw err;
      }
    }
  )
  // =====================
  // PUT /reports — Тайлан засах
  // =====================
  .put(
    '/reports',
    rbac({ roles: ['markscheider', 'admin'] }),
    zValidator(
      'json',
      z.object({
        id: z.string().uuid(),
        reportDate: z.string().optional(),
        vehicleId: z.string().uuid().optional(),
        operatorId: z.string().uuid().optional(),
        masterId: z.string().uuid().optional(),
        blockNumbers: z.array(z.string()).optional(),
        markProduction: z.coerce.string().optional().transform(v => v?.trim() || null),
        disSoil: z.coerce.string().optional().transform(v => v?.trim() || null),
        disCoal: z.coerce.string().optional().transform(v => v?.trim() || null),
        disReisSoil: z.coerce.number().optional(),
        disReisCoal: z.coerce.number().optional(),
        disTotalProduction: z.coerce.string().optional().transform(v => v?.trim() || null),
        disCoefficient: z.coerce.string().optional().transform(v => v?.trim() || null),
        markDisDiscrepancy: z.coerce.string().optional().transform(v => v?.trim() || null),
        notes: z.string().optional(),
      })
    ),
    async (c) => {
      const { id, ...rest } = c.req.valid('json');
      const user = c.get('currentUser');
      if (!user.organizationId) throw new HTTPException(403, { message: 'Unauthorized' });

      const report = await updateMarkshaderReport(id, rest);
      if (!report) throw new HTTPException(404, { message: 'Report not found' });

      return c.json(report);
    }
  )

  // =====================
  // DELETE /reports/:id — Тайлан устгах
  // =====================
  .delete(
    '/reports/:id',
    rbac({ roles: ['markscheider', 'admin'] }),
    async (c) => {
      const { id } = c.req.param();
      const user = c.get('currentUser');
      if (!user.organizationId) throw new HTTPException(403, { message: 'Unauthorized' });

      const deleted = await deleteMarkShaderReport(id, user.organizationId);
      if (!deleted) throw new HTTPException(404, { message: 'Report not found' });

      return c.json({ message: 'Report deleted successfully' });
    }
  )

  // =====================
  // GET /stats — Статистик
  // =====================
  .get(
    '/stats',
    rbac({ roles: ['markscheider', 'admin', 'dispatcher'] }),
    zValidator(
      'query',
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    ),
    async (c) => {
      const input = c.req.valid('query');
      const user = c.get('currentUser');
      if (!user.organizationId) throw new HTTPException(403, { message: 'Unauthorized' });

      const stats = await getMarkshaderStats({
        organizationId: user.organizationId,
        startDate: input.startDate,
        endDate: input.endDate,
      });

      return c.json(stats);
    }
  )

  // =====================
  // GET /actual-production — Excavator бүрийн ДИС мэдээ
  // =====================
  .get(
    '/actual-production',
    rbac({ roles: ['markscheider', 'admin', 'dispatcher'] }),
    zValidator(
      'query',
      z.object({
        date: z.string(),
        vehicleId: z.string().uuid(),
      })
    ),
    async (c) => {
      const { date, vehicleId } = c.req.valid('query');
      const user = c.get('currentUser');
      if (!user.organizationId) throw new HTTPException(403, { message: 'Unauthorized' });

      const data = await getActualProductionByVehicleAndDate(
        date,
        user.organizationId,
        vehicleId,
      );

      return c.json(data);
    }
  )

  // =====================
  // GET /excavators — Тухайн өдөр ажилласан excavator жагсаалт
  // =====================
  .get(
    '/excavators',
    rbac({ roles: ['markscheider', 'admin', 'dispatcher'] }),
    zValidator(
      'query',
      z.object({
        date: z.string(),
      })
    ),
    async (c) => {
      const { date } = c.req.valid('query');
      const user = c.get('currentUser');
      if (!user.organizationId) throw new HTTPException(403, { message: 'Unauthorized' });

      const excavators = await getExcavatorsByDate(date, user.organizationId);
      return c.json(excavators);
    }
  )

  // =====================
  // POST /import — Excel файл upload → DB insert
  // =====================
  .post(
    '/import',
    rbac({ roles: ['markscheider', 'admin'] }),
    async (c) => {
      const user = c.get('currentUser');
      if (!user.organizationId) throw new HTTPException(403, { message: 'Unauthorized' });

      const formData = await c.req.formData();
      const file = formData.get('file');
      const year = formData.get('year');
      const month = formData.get('month');

      if (!file || !(file instanceof File)) {
        throw new HTTPException(400, { message: 'Excel файл оруулна уу' });
      }
      if (!year || !month) {
        throw new HTTPException(400, { message: 'Он, сар заавал оруулна уу' });
      }

      const yearStr = String(year);
      const monthStr = String(month).padStart(2, '0');

      const buffer = await file.arrayBuffer();
      const { rows, errors: parseErrors, excavatorNames } = parseMarkshaderExcel(buffer);

      if (rows.length === 0) {
        throw new HTTPException(400, { message: 'Excel файлд өгөгдөл олдсонгүй' });
      }

      // Excavator-уудыг DB-ээс mineNumber-аар хайх
      const vehicleList = await drizzleDb
        .select({
          id: vehicles.id,
          mineNumber: vehicles.mineNumber,
          name: vehicles.name,
        })
        .from(vehicles)
        .where(
          and(
            eq(vehicles.organizationId, user.organizationId),
            isNull(vehicles.deletedAt)
          )
        );

      // mineNumber → vehicle map (uppercase)
      const vehicleMap = new Map(
        vehicleList
          .filter((v): v is typeof v & { mineNumber: string } => v.mineNumber !== null)
          .map((v) => [v.mineNumber.toUpperCase(), v])
      );

      let inserted = 0;
      let skipped = 0;
      const importErrors: string[] = [...parseErrors];

      for (const row of rows) {
        const vehicle = vehicleMap.get(row.mineName.toUpperCase());

        if (!vehicle) {
          importErrors.push(`Excavator олдсонгүй: ${row.mineName}`);
          skipped++;
          continue;
        }

        const dayStr = String(row.day).padStart(2, '0');
        const reportDate = `${yearStr}-${monthStr}-${dayStr}`;

        // Марк-Дис зөрүү тооцоолох
        const markDisDiscrepancy =
          row.markProduction !== null && row.disTotalProduction !== null
            ? String((row.markProduction - row.disTotalProduction).toFixed(4))
            : null;

        // ДИС коэффициент
        const disCoefficient =
          row.disCoefficient !== null
            ? String(row.disCoefficient)
            : row.markProduction && row.disTotalProduction
              ? String((row.disTotalProduction / row.markProduction).toFixed(6))
              : null;

        try {
          await createMarkshaderReport({
            organizationId: user.organizationId,
            reportDate,
            shiftType: row.shiftType,
            vehicleId: vehicle.id,
            operatorId: null,
            masterId: null,
            blockNumbers: row.blockNumbers.length > 0 ? row.blockNumbers : null,
            markProduction: row.markProduction !== null ? String(row.markProduction) : null,
            disSoil: row.disSoil !== null ? String(row.disSoil) : null,
            disCoal: row.disCoal !== null ? String(row.disCoal) : null,
            disReisSoil: row.disReisSoil !== null ? Math.round(row.disReisSoil) : 0,
            disReisCoal: row.disReisCoal !== null ? Math.round(row.disReisCoal) : 0,
            disTotalProduction: row.disTotalProduction !== null ? String(row.disTotalProduction) : null,
            disCoefficient,
            markDisDiscrepancy,
            notes: null,
            recordedBy: user.id,
          });
          inserted++;
        } catch (err: unknown) {
          const pgErr = err as { code?: string; message?: string };
          if (pgErr?.code === '23505') {
            // Unique constraint — аль хэдийн байгаа
            skipped++;
          } else {
            importErrors.push(
              `${row.mineName} ${reportDate} ${row.shiftType}: ${pgErr?.message ?? 'Алдаа'}`
            );
          }
        }
      }

      return c.json({
        success: true,
        inserted,
        skipped,
        errors: importErrors,
        excavatorNames,
      });
    }
  )

  // =====================
  // GET /export — Excel татах
  // Query: startDate?, endDate?, vehicleId?
  // =====================
  .get(
    '/export',
    rbac({ roles: ['markscheider', 'admin', 'dispatcher'] }),
    zValidator(
      'query',
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        vehicleId: z.string().uuid().optional(),
      })
    ),
    async (c) => {
      const { startDate, endDate, vehicleId } = c.req.valid('query');
      const user = c.get('currentUser');
      if (!user.organizationId) throw new HTTPException(403, { message: 'Unauthorized' });

      // WHERE нөхцөл
      const conditions = [
        eq(markshaderDailyReports.organizationId, user.organizationId),
      ];
      if (startDate) conditions.push(gte(markshaderDailyReports.reportDate, startDate));
      if (endDate) conditions.push(lte(markshaderDailyReports.reportDate, endDate));
      if (vehicleId) conditions.push(eq(markshaderDailyReports.vehicleId, vehicleId));

      const reports = await drizzleDb
        .select({
          reportDate: markshaderDailyReports.reportDate,
          shiftType: markshaderDailyReports.shiftType,
          vehicleName: vehicles.name,
          mineNumber: vehicles.mineNumber,
          blockNumbers: markshaderDailyReports.blockNumbers,
          markProduction: markshaderDailyReports.markProduction,
          disSoil: markshaderDailyReports.disSoil,
          disCoal: markshaderDailyReports.disCoal,
          disReisSoil: markshaderDailyReports.disReisSoil,
          disReisCoal: markshaderDailyReports.disReisCoal,
          disTotalProduction: markshaderDailyReports.disTotalProduction,
          disCoefficient: markshaderDailyReports.disCoefficient,
          markDisDiscrepancy: markshaderDailyReports.markDisDiscrepancy,
        })
        .from(markshaderDailyReports)
        .leftJoin(vehicles, eq(markshaderDailyReports.vehicleId, vehicles.id))
        .where(and(...conditions))
        .orderBy(markshaderDailyReports.reportDate, vehicles.mineNumber);

      if (reports.length === 0) {
        throw new HTTPException(404, { message: 'Өгөгдөл олдсонгүй' });
      }

      const exportVehicleName = vehicleId ? (reports[0]?.vehicleName ?? undefined) : undefined;
      const title = `Маркшейдрийн мэдээ ${startDate ?? ''} - ${endDate ?? ''}`;

      const exportRows = reports.map((r) => ({
        reportDate: r.reportDate ?? '',
        shiftType: r.shiftType as 'day' | 'night',
        vehicleName: r.vehicleName ?? '',
        mineNumber: r.mineNumber ?? '',
        operatorName: null as string | null,
        masterName: null as string | null,
        blockNumbers: r.blockNumbers ?? [],
        markProduction: r.markProduction !== null ? Number(r.markProduction) : null,
        disSoil: r.disSoil !== null ? Number(r.disSoil) : null,
        disCoal: r.disCoal !== null ? Number(r.disCoal) : null,
        disReisSoil: r.disReisSoil ?? null,
        disReisCoal: r.disReisCoal ?? null,
        disTotalProduction: r.disTotalProduction !== null ? Number(r.disTotalProduction) : null,
        disCoefficient: r.disCoefficient !== null ? Number(r.disCoefficient) : null,
        markDisDiscrepancy: r.markDisDiscrepancy !== null ? Number(r.markDisDiscrepancy) : null,
      }));

      const buffer = generateMarkshaderExcel(exportRows, title, {
        startDate,
        endDate,
        vehicleName: exportVehicleName,
      });

      const dateRange = `${startDate ?? 'all'}_${endDate ?? 'all'}`;
      const vehiclePart = exportVehicleName ? `_${exportVehicleName}` : '';
      const filename = `markshader_${dateRange}${vehiclePart}.xlsx`;

      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        },
      });
    }
  );

export default markshaderRoutes;