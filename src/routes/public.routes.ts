import { initializeEmailService } from '$/libs/mailer';
import { Hono } from 'hono';

const publicRoutes = new Hono().get('/ping', async (c) => {
  await initializeEmailService();

  return c.json({ response: 'aitai miaw' });
});

export default publicRoutes;
