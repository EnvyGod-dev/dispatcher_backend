import type { AppEnv } from '$/utils/app-env';
import { Hono } from 'hono';
import { fuelAnalyticsRoutes } from './analytics.routes';
import { fuelBalanceRoutes } from './balances.routes';
import { fuelMasterRoutes } from './master.routes';
import { fuelMovementRoutes } from './movements.routes';

export const fuelRoutes = new Hono<AppEnv>()
  .route('/', fuelMasterRoutes)
  .route('/', fuelMovementRoutes)
  .route('/', fuelBalanceRoutes)
  .route('/', fuelAnalyticsRoutes);

export default fuelRoutes;