CREATE TABLE idle_reason_types (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  vehicle_types    TEXT[] NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT idle_reason_types_name_org_uq UNIQUE (organization_id, name)
);

CREATE INDEX idx_idle_reason_types_org ON idle_reason_types(organization_id);
CREATE INDEX idx_idle_reason_types_vehicle_types ON idle_reason_types USING GIN(vehicle_types);

CREATE TABLE equipment_shift_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id       UUID NOT NULL REFERENCES vehicles(id),
  operator_id      UUID REFERENCES users(id),
  shift_id         UUID REFERENCES shifts(id),

  operational_date DATE NOT NULL,
  shift_type       TEXT NOT NULL CHECK (shift_type IN ('day', 'night')),

  total_hours      NUMERIC(5,1) NOT NULL DEFAULT 10.0,
  worked_hours     NUMERIC(5,1),
  repair_hours     NUMERIC(5,1) DEFAULT 0,
  idle_hours       NUMERIC(5,1) DEFAULT 0,

  fuel_received    NUMERIC(8,2),

  notes            TEXT,

  recorded_by      UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT equipment_shift_logs_uq
    UNIQUE (organization_id, vehicle_id, operational_date, shift_type)
);

CREATE INDEX idx_esl_org ON equipment_shift_logs(organization_id);
CREATE INDEX idx_esl_vehicle ON equipment_shift_logs(vehicle_id);
CREATE INDEX idx_esl_date ON equipment_shift_logs(operational_date);
CREATE INDEX idx_esl_shift ON equipment_shift_logs(shift_id);

-- worked_hours автоматаар тооцоолох trigger
CREATE OR REPLACE FUNCTION calc_worked_hours()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.worked_hours := NEW.total_hours
    - COALESCE(NEW.repair_hours, 0)
    - COALESCE(NEW.idle_hours, 0);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calc_worked_hours
  BEFORE INSERT OR UPDATE ON equipment_shift_logs
  FOR EACH ROW EXECUTE FUNCTION calc_worked_hours();

CREATE TABLE equipment_idle_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_log_id     UUID NOT NULL REFERENCES equipment_shift_logs(id) ON DELETE CASCADE,
  idle_reason_id   UUID  NULL REFERENCES idle_reason_types(id),
  hours            NUMERIC(5,1) NOT NULL CHECK (hours > 0),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eie_shift_log ON equipment_idle_entries(shift_log_id);
CREATE INDEX idx_eie_reason ON equipment_idle_entries(idle_reason_id);

CREATE OR REPLACE FUNCTION sync_idle_hours()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total NUMERIC(5,1);
  v_log_id UUID;
BEGIN
  v_log_id := COALESCE(NEW.shift_log_id, OLD.shift_log_id);

  SELECT COALESCE(SUM(hours), 0)
    INTO v_total
    FROM equipment_idle_entries
   WHERE shift_log_id = v_log_id;

  UPDATE equipment_shift_logs
     SET idle_hours = v_total,
         updated_at = now()
   WHERE id = v_log_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_idle_hours
  AFTER INSERT OR UPDATE OR DELETE ON equipment_idle_entries
  FOR EACH ROW EXECUTE FUNCTION sync_idle_hours();

ALTER TABLE equipment_idle_entries
ALTER COLUMN idle_reason_id DROP NOT NULL;