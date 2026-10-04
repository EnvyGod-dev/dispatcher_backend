import {
  createBulkInspection,
  createInspection,
  deleteInspection,
  getInspectionCount,
  getInspections,
  updateInspection,
  type Inspection,
} from '$/context/inspection';
import { enumVehicleType } from '$/libs/database/schema';
import { rbac } from '$/middlewares/rbac.middleware';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { File } from 'node:buffer';
import * as XLSX from 'xlsx';
import { z } from 'zod';

const inspectionRoutes = new Hono<AppEnv>()
  .post(
    '/inspection',
    rbac({ roles: ['markscheider', 'dispatcher', 'ita'] }),
    zValidator(
      'json',
      z.object({
        vehicleType: z.enum(enumVehicleType.enumValues),
        type: z.string(),
        name: z.string(),
      })
    ),
    async (c) => {
      const input = c.req.valid('json');
      const currentUser = c.get('currentUser');

      if (!currentUser || !currentUser.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const created = await createInspection({
        ...input,
        organizationId: currentUser.organizationId,
      });

      return c.json(created);
    }
  )
  .post(
    '/inspections/bulk',
    rbac({ roles: ['markscheider', 'dispatcher', 'ita'] }),
    async (c) => {
      const currentUser = c.get('currentUser');

      if (!currentUser.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const body = await c.req.parseBody();
      const file = (body['file'] as File) || body.file;

      if (!file) {
        throw new HTTPException(400, {
          message: 'No file provided',
        });
      }

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0] as string;

      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        throw new HTTPException(422, {
          message: 'Файл ачааллахад алдаа гарлаа.',
        });
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Inspection[];

      const results = await createBulkInspection({
        jsonData: jsonData,
        organizationId: currentUser.organizationId,
      });

      return c.json(results);
    }
  )
  .put(
    '/inspection',
    rbac({ roles: ['markscheider', 'dispatcher', 'ita'] }),
    zValidator(
      'json',
      z.object({
        id: z.string(),
        vehicleType: z.enum(enumVehicleType.enumValues).optional(),
        type: z.string().optional(),
        name: z.string().optional(),
      })
    ),
    async (c) => {
      const input = c.req.valid('json');
      const currentUser = c.get('currentUser');

      if (!currentUser || !currentUser.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const updated = await updateInspection(input.id, input);

      return c.json(updated);
    }
  )
  .delete(
    '/inspection',
    rbac({ roles: ['markscheider', 'dispatcher', 'ita'] }),
    zValidator(
      'json',
      z.object({
        id: z.string(),
      })
    ),
    async (c) => {
      const { id } = c.req.valid('json');

      const deleted = await deleteInspection(id);

      return c.json(deleted !== null);
    }
  )
  .get(
    '/inspections',
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number().default(50),
        offset: z.coerce.number().default(0),
        vehicleType: z.enum(enumVehicleType.enumValues).optional(),
      })
    ),
    async (c) => {
      const { limit, offset, vehicleType } = c.req.valid('query');

      const currentUser = c.get('currentUser');

      if (!currentUser || !currentUser.organizationId) {
        throw new HTTPException(403, {
          message: 'Unauthorized',
        });
      }

      const data = await getInspections(
        { limit, offset },
        { organizationId: currentUser.organizationId, vehicleType }
      );

      const totalCount = await getInspectionCount({
        organizationId: currentUser.organizationId,
        vehicleType,
      });

      return c.json(data, {
        headers: {
          'X-Total-Count': totalCount.toString(),
        },
      });
    }
  );

export default inspectionRoutes;
