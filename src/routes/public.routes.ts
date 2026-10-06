import { getOrganizationBySubdomain } from '$/context/organization';
import { initializeEmailService } from '$/libs/mailer';
import { Hono } from 'hono';

const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const publicRoutes = new Hono()
  .get('/ping', async (c) => {
    await initializeEmailService();

    return c.json({ response: 'aitai miaw' });
  })

  /**
   * Нэвтрэх хуудсанд байгууллагын нэр, лого харуулна (нэвтрэхээс өмнө).
   * Байхгүй / идэвхгүй бол null буцаана — веб Stratum-ын логог харуулна.
   */
  .get('/branding/:subdomain', async (c) => {
    const subdomain = c.req.param('subdomain').trim().toLowerCase();
    const empty = { name: null, logoUrl: null };

    if (!SUBDOMAIN_REGEX.test(subdomain)) return c.json(empty);

    const organization = await getOrganizationBySubdomain(subdomain);
    if (!organization || organization.deactivatedAt) return c.json(empty);

    c.header('Cache-Control', 'public, max-age=300');
    return c.json({ name: organization.name, logoUrl: organization.logoUrl ?? null });
  });

export default publicRoutes;
