-- Засварын шалтгааныг ангилна: 'repair' (засварын төрөл) эсвэл 'technical_idle' (техникийн сул зогсолт).
-- Технологийн сул зогсолт idle_reason_types хүснэгтэд хэвээр (цаг ашиглалт руу орно).

ALTER TABLE repair_reason_types
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'repair';

ALTER TABLE repair_reason_types
  DROP CONSTRAINT IF EXISTS repair_reason_types_category_check;

ALTER TABLE repair_reason_types
  ADD CONSTRAINT repair_reason_types_category_check
  CHECK (category IN ('repair', 'technical_idle'));
