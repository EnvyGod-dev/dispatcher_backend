import {
  cancelFuelRefueling,
  createFuelIssue,
  createFuelReceipt,
  createFuelReceiptEditRequest,
  createFuelRefueling,
  getFuelIssues,
  getFuelReceiptEditRequests,
  getFuelReceiptEmailLogs,
  getFuelReceipts,
  getFuelRefuelings,
  reviewFuelReceiptEditRequest,
  sendFuelReceiptActEmail,
  setFuelReceiptActFile,
  syncFuelRefuelings,
  updateFuelRefueling,
} from '$/context/fuel';
import { rbac } from '$/middlewares/rbac.middleware';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  FUEL_ROLES,
  actFileSchema,
  editRequestSchema,
  idParam,
  issueSchema,
  issuesQuery,
  orgOf,
  receiptSchema,
  receiptsQuery,
  refuelingCancelSchema,
  refuelingSchema,
  refuelingSyncSchema,
  refuelingUpdateSchema,
  refuelingsQuery,
  rejectSchema,
  reviewSchema,
  run,
  userOf,
} from './schemas';

export const fuelMovementRoutes = new Hono<AppEnv>()
  .get('/receipts', rbac({ roles: FUEL_ROLES.view }), zValidator('query', receiptsQuery), async (c) => {
    return c.json(await getFuelReceipts(orgOf(c), c.req.valid('query')));
  })
  .post('/receipts', rbac({ roles: FUEL_ROLES.register }), zValidator('json', receiptSchema), async (c) => {
    const body = c.req.valid('json');
    const user = userOf(c);

    return run(async () => {
      const receipt = await createFuelReceipt({
        ...body,
        organizationId: orgOf(c),
        receivedBy: body.receivedBy ?? user.id,
        createdBy: user.id,
      });

      return c.json(receipt, 201);
    });
  })
  .put(
    '/receipts/:id/act-file',
    rbac({ roles: FUEL_ROLES.register }),
    zValidator('param', idParam),
    zValidator('json', actFileSchema),
    async (c) => {
      const body = c.req.valid('json');

      return run(async () => {
        const receipt = await setFuelReceiptActFile(
          orgOf(c),
          c.req.valid('param').id,
          body.actFileUrl,
          userOf(c).id,
          body.sendEmail ?? true,
        );

        return c.json(receipt);
      });
    },
  )
  .post('/receipts/:id/act/resend', rbac({ roles: FUEL_ROLES.register }), zValidator('param', idParam), async (c) => {
    return run(async () => {
      const result = await sendFuelReceiptActEmail({
        organizationId: orgOf(c),
        receiptId: c.req.valid('param').id,
        triggeredBy: userOf(c).id,
      });

      return c.json(result);
    });
  })
  .get('/receipts/:id/email-logs', rbac({ roles: FUEL_ROLES.view }), zValidator('param', idParam), async (c) => {
    return c.json(await getFuelReceiptEmailLogs(orgOf(c), c.req.valid('param').id));
  })
  .post(
    '/receipts/:id/edit-requests',
    rbac({ roles: FUEL_ROLES.register }),
    zValidator('param', idParam),
    zValidator('json', editRequestSchema),
    async (c) => {
      const body = c.req.valid('json');

      return run(async () => {
        const request = await createFuelReceiptEditRequest({
          organizationId: orgOf(c),
          receiptId: c.req.valid('param').id,
          type: body.type,
          changes: body.changes,
          reason: body.reason,
          requestedBy: userOf(c).id,
        });

        return c.json(request, 201);
      });
    },
  )

  .get(
    '/receipt-edit-requests',
    rbac({ roles: FUEL_ROLES.view }),
    zValidator('query', z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() })),
    async (c) => {
      return c.json(await getFuelReceiptEditRequests(orgOf(c), c.req.valid('query').status));
    },
  )
  .post(
    '/receipt-edit-requests/:id/approve',
    rbac({ roles: FUEL_ROLES.approve }),
    zValidator('param', idParam),
    zValidator('json', reviewSchema),
    async (c) => {
      const user = userOf(c);

      return run(async () => {
        const request = await reviewFuelReceiptEditRequest({
          organizationId: orgOf(c),
          requestId: c.req.valid('param').id,
          approved: true,
          reviewedBy: user.id,
          reviewerRole: user.role,
          reviewNote: c.req.valid('json').note ?? null,
        });

        return c.json(request);
      });
    },
  )
  .post(
    '/receipt-edit-requests/:id/reject',
    rbac({ roles: FUEL_ROLES.approve }),
    zValidator('param', idParam),
    zValidator('json', rejectSchema),
    async (c) => {
      const user = userOf(c);

      return run(async () => {
        const request = await reviewFuelReceiptEditRequest({
          organizationId: orgOf(c),
          requestId: c.req.valid('param').id,
          approved: false,
          reviewedBy: user.id,
          reviewerRole: user.role,
          reviewNote: c.req.valid('json').note,
        });

        return c.json(request);
      });
    },
  )

  .get('/issues', rbac({ roles: FUEL_ROLES.view }), zValidator('query', issuesQuery), async (c) => {
    return c.json(await getFuelIssues(orgOf(c), c.req.valid('query')));
  })
  .post('/issues', rbac({ roles: FUEL_ROLES.register }), zValidator('json', issueSchema), async (c) => {
    const body = c.req.valid('json');
    const user = userOf(c);

    return run(async () => {
      const issue = await createFuelIssue({
        ...body,
        organizationId: orgOf(c),
        issuedBy: body.issuedBy ?? user.id,
        createdBy: user.id,
      });

      return c.json(issue, 201);
    });
  })

  .get('/refuelings', rbac({ roles: FUEL_ROLES.view }), zValidator('query', refuelingsQuery), async (c) => {
    return c.json(await getFuelRefuelings(orgOf(c), c.req.valid('query')));
  })
  .post('/refuelings', rbac({ roles: FUEL_ROLES.operate }), zValidator('json', refuelingSchema), async (c) => {
    const body = c.req.valid('json');
    const user = userOf(c);

    return run(async () => {
      const refueling = await createFuelRefueling({
        ...body,
        organizationId: orgOf(c),
        operatorId: body.operatorId ?? user.id,
        createdBy: user.id,
      });

      return c.json(refueling, 201);
    });
  })
  .post('/refuelings/sync', rbac({ roles: FUEL_ROLES.operate }), zValidator('json', refuelingSyncSchema), async (c) => {
    const user = userOf(c);
    const items = c.req.valid('json').items.map((item) => ({
      ...item,
      operatorId: item.operatorId ?? user.id,
    }));

    return c.json(await syncFuelRefuelings(orgOf(c), user.id, items));
  })
  .put(
    '/refuelings/:id',
    rbac({ roles: FUEL_ROLES.supervise }),
    zValidator('param', idParam),
    zValidator('json', refuelingUpdateSchema),
    async (c) => {
      const { reason, ...changes } = c.req.valid('json');

      return run(async () => {
        const refueling = await updateFuelRefueling({
          organizationId: orgOf(c),
          id: c.req.valid('param').id,
          changes,
          reason,
          userId: userOf(c).id,
        });

        return c.json(refueling);
      });
    },
  )
  .post(
    '/refuelings/:id/cancel',
    rbac({ roles: FUEL_ROLES.supervise }),
    zValidator('param', idParam),
    zValidator('json', refuelingCancelSchema),
    async (c) => {
      return run(async () => {
        const refueling = await cancelFuelRefueling({
          organizationId: orgOf(c),
          id: c.req.valid('param').id,
          reason: c.req.valid('json').reason,
          userId: userOf(c).id,
        });

        return c.json(refueling);
      });
    },
  );
