import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { readOnlyRoleGuard } from './rbac.middleware';

const appFor = (role: string) => {
  const app = new Hono<{ Variables: { currentUser: { role: string } } }>();
  app.use('*', async (c, next) => {
    c.set('currentUser', { role });
    await next();
  });
  app.use('*', readOnlyRoleGuard);
  app.all('*', (c) => c.json({ ok: true }));
  app.onError((err, c) => c.json({ error: err.message }, err instanceof HTTPException ? err.status : 500));
  return app;
};

describe('readOnlyRoleGuard', () => {
  it('lets a manager read but blocks every change', async () => {
    const app = appFor('manager');
    expect((await app.request('/internal/mining-report?from=a', { method: 'GET' })).status).toBe(200);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((await app.request('/internal/fuel/receipts', { method })).status).toBe(403);
    }
    // Өөрийн төхөөрөмжийн мэдэгдлийн токеныг бүртгэж болно.
    expect((await app.request('/internal/save-firebase-token', { method: 'POST' })).status).toBe(200);
    expect((await app.request('/internal/device-tokens', { method: 'DELETE' })).status).toBe(200);
  });

  it('does not affect other roles', async () => {
    for (const role of ['admin', 'dispatcher', 'fuel_operator', 'driver']) {
      expect((await appFor(role).request('/internal/fuel/receipts', { method: 'POST' })).status).toBe(200);
    }
  });
});
