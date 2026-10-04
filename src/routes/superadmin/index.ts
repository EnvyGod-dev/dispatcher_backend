import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import organizationManagementRoute from './organization-management.route';

const router = new Hono<AppEnv>();

router.route('/', organizationManagementRoute);

export default router;
