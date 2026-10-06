import { beforeEach, describe, expect, it, vi } from 'vitest';

const getOrganizationBySubdomain = vi.fn();
vi.mock('$/context/organization', () => ({ getOrganizationBySubdomain: (s: string) => getOrganizationBySubdomain(s) }));
vi.mock('$/libs/mailer', () => ({ initializeEmailService: vi.fn() }));

const { default: publicRoutes } = await import('./public.routes');

describe('GET /branding/:subdomain', () => {
  beforeEach(() => getOrganizationBySubdomain.mockReset());

  it('returns name and logo for an active organization', async () => {
    getOrganizationBySubdomain.mockResolvedValue({ name: 'Хавцгайт', logoUrl: 'https://r2/logo.png', deactivatedAt: null });
    const res = await publicRoutes.request('/branding/Khavtsgait');
    expect(await res.json()).toEqual({ name: 'Хавцгайт', logoUrl: 'https://r2/logo.png' });
    expect(getOrganizationBySubdomain).toHaveBeenCalledWith('khavtsgait');
  });

  it('returns nulls for unknown, deactivated or invalid subdomains', async () => {
    getOrganizationBySubdomain.mockResolvedValueOnce(null);
    expect(await (await publicRoutes.request('/branding/none')).json()).toEqual({ name: null, logoUrl: null });
    getOrganizationBySubdomain.mockResolvedValueOnce({ name: 'X', logoUrl: 'u', deactivatedAt: '2026-01-01' });
    expect(await (await publicRoutes.request('/branding/old')).json()).toEqual({ name: null, logoUrl: null });
    expect(await (await publicRoutes.request('/branding/bad_name!')).json()).toEqual({ name: null, logoUrl: null });
    expect(getOrganizationBySubdomain).toHaveBeenCalledTimes(2);
  });

  it('returns null logo when the organization has none', async () => {
    getOrganizationBySubdomain.mockResolvedValue({ name: 'Y', logoUrl: null, deactivatedAt: null });
    expect(await (await publicRoutes.request('/branding/y')).json()).toEqual({ name: 'Y', logoUrl: null });
  });
});
