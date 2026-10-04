import { drizzleDb } from '$/libs/database/db';
import { organizations } from '$/libs/database/schema';
import { first } from '$/libs/database/utils';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

const organizationManagementRoute = new Hono().put(
  '/admin',
  zValidator(
    'json',
    z.object({
      id: z.string(),
      name: z.string().optional(),
      contactEmail: z.string().optional(),
      contactPhone: z.string().optional(),
    })
  ),
  async (c) => {
    const input = c.req.valid('json');

    const updated = first(
      await drizzleDb
        .update(organizations)
        .set(input)
        .where(eq(organizations.id, input.id))
        .returning()
    );

    return c.json(updated);
  }
);

export default organizationManagementRoute;
