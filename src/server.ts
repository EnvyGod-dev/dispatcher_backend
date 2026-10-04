import { serve } from '@hono/node-server';
import { showRoutes } from 'hono/dev';
import { app } from './app'; // Import the named export

const port = process.env.PORT || 4040;

console.log('🔐 Loading environment variables...');
console.log('✅ Environment variables loaded');

console.log(`Server is running on port - ${port}`);

showRoutes(app);

serve({
  fetch: app.fetch,
  port: Number(port),
});
