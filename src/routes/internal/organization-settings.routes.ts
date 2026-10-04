import { Hono } from 'hono';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '$/utils/app-env';
import { rbac } from '$/middlewares/rbac.middleware';
import { getOrgSettings, upsertOrgSettings } from '$/context/organization-settings';

const orgSettingsRoutes = new Hono<AppEnv>()
    .get(
        '/',
        rbac({ roles: ['admin', 'dispatcher'] }),
        async (c) => {
            const user = c.get('currentUser');
            if (!user.organizationId) {
                throw new HTTPException(403, { message: 'Unauthorized' });
            }

            const settings = await getOrgSettings(user.organizationId);
            return c.json(settings);
        }
    )

    .put(
        '/',
        rbac({ roles: ['admin', 'dispatcher'] }),
        zValidator(
            'json',
            z.object({
                shiftDurationHours: z.coerce
                    .number()
                    .min(1, 'Хамгийн багадаа 1 цаг байх ёстой')
                    .max(24, 'Хамгийн ихдээ 24 цаг байх ёстой')
                    .multipleOf(0.1, '0.1 (6 мин) -ийн үржвэр байх ёстой')
                    .optional()
                    .transform((v) => (v != null ? String(v) : undefined)),
                shiftMode: z.enum(['single', 'double']).optional(),
            })
        ),
        async (c) => {
            const user = c.get('currentUser');
            if (!user.organizationId) {
                throw new HTTPException(403, { message: 'Unauthorized' });
            }

            const body = c.req.valid('json');
            const settings = await upsertOrgSettings(user.organizationId, body);
            return c.json(settings);
        }
    );

export default orgSettingsRoutes;