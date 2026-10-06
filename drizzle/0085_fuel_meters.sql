-- Агуулах, түгээгч машины тоолуур. Заалтыг серверт хадгалж бүх утаснаас үргэлжлүүлэн тооцно.
-- Заалтыг text-ээр хадгална: урд талын 0-ууд (жишээ нь 0001234) хадгалагдана.
-- Оронгийн тоог (digits) тоолуурыг бүртгэхдээ сонгоно; DB дээр оронгийн хязгаар тавихгүй.

CREATE TABLE IF NOT EXISTS fuel_meters (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  holder_type     enum_fuel_holder_type NOT NULL,
  tank_id         UUID REFERENCES fuel_tanks(id),
  vehicle_id      UUID REFERENCES vehicles(id),
  digits          INTEGER NOT NULL,
  reading         TEXT NOT NULL,
  reading_at      TIMESTAMPTZ NOT NULL,
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fuel_meter_tank
  ON fuel_meters (organization_id, tank_id) WHERE tank_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fuel_meter_vehicle
  ON fuel_meters (organization_id, vehicle_id) WHERE vehicle_id IS NOT NULL;

-- Олголтын заалт: тоон утгын хязгаарыг авч (numeric), бичсэн хэлбэрээр нь (0-уудтай) хадгална.
ALTER TABLE fuel_refuelings ALTER COLUMN meter_start TYPE numeric;
ALTER TABLE fuel_refuelings ALTER COLUMN meter_end TYPE numeric;
ALTER TABLE fuel_refuelings ADD COLUMN IF NOT EXISTS meter_start_reading TEXT;
ALTER TABLE fuel_refuelings ADD COLUMN IF NOT EXISTS meter_end_reading TEXT;

-- Зарлага (агуулахаас түгээгч рүү) агуулахын тоолуураар бүртгэгдэж болно.
ALTER TABLE fuel_issues ADD COLUMN IF NOT EXISTS meter_start numeric;
ALTER TABLE fuel_issues ADD COLUMN IF NOT EXISTS meter_end numeric;
ALTER TABLE fuel_issues ADD COLUMN IF NOT EXISTS meter_start_reading TEXT;
ALTER TABLE fuel_issues ADD COLUMN IF NOT EXISTS meter_end_reading TEXT;
