CREATE TABLE IF NOT EXISTS repair_reason_types (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

    organization_id uuid NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    name text NOT NULL,

    vehicle_types text[] NOT NULL DEFAULT '{}',

    is_active boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_repair_reason_types_org
    ON repair_reason_types(organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS repair_reason_types_name_org_uq
    ON repair_reason_types(
        organization_id,
        name
    );

CREATE TABLE IF NOT EXISTS equipment_repair_entries (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

    shift_log_id uuid NOT NULL
        REFERENCES equipment_shift_logs(id)
        ON DELETE CASCADE,

    repair_reason_id uuid
        REFERENCES repair_reason_types(id),

    mechanic_id uuid
        REFERENCES users(id)
        ON DELETE SET NULL,

    hours numeric(5, 1) NOT NULL,

    notes text,

    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_equipment_repair_entries_shift_log
    ON equipment_repair_entries(shift_log_id);

CREATE INDEX IF NOT EXISTS idx_equipment_repair_entries_reason
    ON equipment_repair_entries(repair_reason_id);