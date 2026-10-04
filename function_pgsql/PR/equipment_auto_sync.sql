BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE INDEX IF NOT EXISTS idx_equipment_shift_logs_org_date
ON equipment_shift_logs (organization_id, operational_date);

CREATE INDEX IF NOT EXISTS idx_equipment_shift_logs_shift_id
ON equipment_shift_logs (shift_id);

CREATE INDEX IF NOT EXISTS idx_equipment_shift_logs_vehicle_date
ON equipment_shift_logs (vehicle_id, operational_date);

CREATE INDEX IF NOT EXISTS idx_equipment_idle_entries_shift_log
ON equipment_idle_entries (shift_log_id);

CREATE INDEX IF NOT EXISTS idx_shifts_sync_lookup
ON shifts (organization_id, vehicle_id, operational_date, shift_type);

CREATE INDEX IF NOT EXISTS idx_shifts_status_date
ON shifts (shift_status, operational_date);

CREATE UNIQUE INDEX IF NOT EXISTS equipment_shift_logs_auto_uq
ON equipment_shift_logs (
  organization_id,
  vehicle_id,
  operational_date,
  shift_type
);

CREATE OR REPLACE FUNCTION recalc_equipment_shift_log_self_hours()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_hours := COALESCE(NEW.total_hours, 10.0);
  NEW.repair_hours := COALESCE(NEW.repair_hours, 0);
  NEW.idle_hours := COALESCE(NEW.idle_hours, 0);

  NEW.worked_hours := GREATEST(
    0,
    NEW.total_hours - NEW.repair_hours - NEW.idle_hours
  );

  NEW.updated_at := CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalc_equipment_shift_log_self_hours
ON equipment_shift_logs;

CREATE TRIGGER trg_recalc_equipment_shift_log_self_hours
BEFORE INSERT OR UPDATE OF total_hours, repair_hours, idle_hours
ON equipment_shift_logs
FOR EACH ROW
EXECUTE FUNCTION recalc_equipment_shift_log_self_hours();

CREATE OR REPLACE FUNCTION recalc_equipment_shift_log_hours_from_idle()
RETURNS TRIGGER AS $$
DECLARE
  target_shift_log_id uuid;
  idle_sum numeric;
BEGIN
  target_shift_log_id := COALESCE(NEW.shift_log_id, OLD.shift_log_id);

  SELECT COALESCE(SUM(hours), 0)
  INTO idle_sum
  FROM equipment_idle_entries
  WHERE shift_log_id = target_shift_log_id;

  UPDATE equipment_shift_logs
  SET
    idle_hours = idle_sum,
    worked_hours = GREATEST(
      0,
      COALESCE(total_hours, 10.0) - COALESCE(repair_hours, 0) - idle_sum
    ),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = target_shift_log_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalc_equipment_shift_log_hours_from_idle
ON equipment_idle_entries;

CREATE TRIGGER trg_recalc_equipment_shift_log_hours_from_idle
AFTER INSERT OR UPDATE OR DELETE
ON equipment_idle_entries
FOR EACH ROW
EXECUTE FUNCTION recalc_equipment_shift_log_hours_from_idle();

CREATE OR REPLACE FUNCTION sync_equipment_shift_log_from_shift()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.operational_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.shift_status = 'cancelled' THEN
    DELETE FROM equipment_shift_logs
    WHERE shift_id = NEW.id;

    RETURN NEW;
  END IF;

  INSERT INTO equipment_shift_logs (
    organization_id,
    vehicle_id,
    operator_id,
    shift_id,
    operational_date,
    shift_type,
    total_hours,
    repair_hours,
    idle_hours,
    worked_hours,
    fuel_received,
    notes,
    recorded_by,
    created_at,
    updated_at
  )
  VALUES (
    NEW.organization_id,
    NEW.vehicle_id,
    NEW.driver_id,
    NEW.id,
    NEW.operational_date,
    NEW.shift_type,
    10.0,
    0,
    0,
    10.0,
    NULL,
    NEW.notes,
    NEW.driver_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (
    organization_id,
    vehicle_id,
    operational_date,
    shift_type
  )
  DO UPDATE SET
    operator_id = EXCLUDED.operator_id,
    shift_id = EXCLUDED.shift_id,
    notes = COALESCE(equipment_shift_logs.notes, EXCLUDED.notes),
    updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_equipment_shift_log_from_shift
ON shifts;

CREATE TRIGGER trg_sync_equipment_shift_log_from_shift
AFTER INSERT OR UPDATE OF
  driver_id,
  vehicle_id,
  organization_id,
  operational_date,
  shift_type,
  shift_status,
  notes
ON shifts
FOR EACH ROW
EXECUTE FUNCTION sync_equipment_shift_log_from_shift();

WITH ranked_shifts AS (
  SELECT
    s.*,
    ROW_NUMBER() OVER (
      PARTITION BY
        s.organization_id,
        s.vehicle_id,
        s.operational_date,
        s.shift_type
      ORDER BY
        s.updated_at DESC,
        s.created_at DESC,
        s.id DESC
    ) AS rn
  FROM shifts s
  WHERE s.shift_status != 'cancelled'
    AND s.operational_date IS NOT NULL
)
INSERT INTO equipment_shift_logs (
  organization_id,
  vehicle_id,
  operator_id,
  shift_id,
  operational_date,
  shift_type,
  total_hours,
  repair_hours,
  idle_hours,
  worked_hours,
  notes,
  recorded_by,
  created_at,
  updated_at
)
SELECT
  s.organization_id,
  s.vehicle_id,
  s.driver_id,
  s.id,
  s.operational_date,
  s.shift_type,
  10.0,
  0,
  0,
  10.0,
  s.notes,
  s.driver_id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM ranked_shifts s
WHERE s.rn = 1
ON CONFLICT (
  organization_id,
  vehicle_id,
  operational_date,
  shift_type
)
DO UPDATE SET
  operator_id = EXCLUDED.operator_id,
  shift_id = EXCLUDED.shift_id,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;