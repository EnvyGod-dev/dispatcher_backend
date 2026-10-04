CREATE TABLE organization_settings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  shift_duration_hours NUMERIC(4,1) NOT NULL DEFAULT 10.0,

  shift_mode           TEXT NOT NULL DEFAULT 'double'
                       CHECK (shift_mode IN ('single', 'double')),

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION create_default_org_settings()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO organization_settings (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_org_settings
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION create_default_org_settings();

INSERT INTO organization_settings (organization_id)
SELECT id FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION get_shift_duration(p_org_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT shift_duration_hours FROM organization_settings WHERE organization_id = p_org_id),
    10.0
  );
$$;