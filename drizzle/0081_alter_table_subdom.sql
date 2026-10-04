ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS subdomain VARCHAR(63);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_subdomain_uq
ON organizations (LOWER(subdomain))
WHERE subdomain IS NOT NULL;