import {
    registerDeviceToken,
    removeDeviceToken,
    sendToUser,
    sendToMultipleUsers,
} from '$/context/notification';
import { zValidator } from '$/middlewares/zodValidator.middleware';
import { rbac } from '$/middlewares/rbac.middleware';
import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import { z } from 'zod';

const notificationRoutes = new Hono<AppEnv>()
    .post(
        '/save-firebase-token',
        zValidator(
            'json',
            z.object({
                firebaseToken: z.string().min(1),
                platform: z.enum(['ios', 'android']),
            }),
        ),
        async (c) => {
            const currentUser = c.get('currentUser');
            const { firebaseToken, platform } = c.req.valid('json');

            const result = await registerDeviceToken({
                userId: currentUser.id,
                token: firebaseToken,
                platform,
            });

            return c.json({ success: true, data: result }, 201);
        },
    )
    // Register device token (called by mobile app on login/startup)
    .post(
        '/device-tokens',
        zValidator(
            'json',
            z.object({
                firebaseToken: z.string().min(1),
                platform: z.enum(['ios', 'android']),
            }),
        ),
        async (c) => {
            const currentUser = c.get('currentUser');
            const { firebaseToken, platform } = c.req.valid('json');

            const result = await registerDeviceToken({
                userId: currentUser.id,
                token: firebaseToken,
                platform,
            });

            return c.json({ success: true, data: result }, 201);
        },
    )

    // Remove device token (called on logout)
    .delete(
        '/device-tokens',
        zValidator(
            'json',
            z.object({
                token: z.string().min(1),
            }),
        ),
        async (c) => {
            const { token } = c.req.valid('json');
            await removeDeviceToken(token);
            return c.json({ success: true });
        },
    )

    // Send notification to a specific user (admin/dispatcher only)
    .post(
        '/notifications/send',
        rbac({ roles: ['admin', 'dispatcher', 'superadmin'] }),
        zValidator(
            'json',
            z.object({
                userId: z.string().uuid(),
                title: z.string().min(1),
                body: z.string().min(1),
                data: z.record(z.string()).optional(),
            }),
        ),
        async (c) => {
            const { userId, title, body, data } = c.req.valid('json');
            const result = await sendToUser({ userId, title, body, data });
            return c.json(result);
        },
    )

    // Send notification to multiple users (admin/dispatcher only)
    .post(
        '/notifications/send-bulk',
        rbac({ roles: ['admin', 'dispatcher', 'superadmin'] }),
        zValidator(
            'json',
            z.object({
                userIds: z.array(z.string().uuid()).min(1),
                title: z.string().min(1),
                body: z.string().min(1),
                data: z.record(z.string()).optional(),
            }),
        ),
        async (c) => {
            const { userIds, title, body, data } = c.req.valid('json');
            const result = await sendToMultipleUsers({ userIds, title, body, data });
            return c.json(result);
        },
    );

export default notificationRoutes;