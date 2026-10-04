import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import userManagementRoute from './user-management.routes';
import vehicleRoutes from './vehicle.routes';
import vehicleOrganizationRoutes from './vehicle-organizations.routes';
import shiftsReportRouter from '../internal/shift-report.routes';

const router = new Hono<AppEnv>();

router.route('/', userManagementRoute);
router.route('/', vehicleRoutes);
router.route('/', vehicleOrganizationRoutes);
router.route('/', shiftsReportRouter);

export default router;
