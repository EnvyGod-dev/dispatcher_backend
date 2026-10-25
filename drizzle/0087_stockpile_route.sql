-- Овоолгыг маршруттай холбоно (вебээс, заавал биш). Маршрут устгагдвал холбоос арилна.

ALTER TABLE stockpiles
  ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stockpiles_route ON stockpiles(route_id);
