-- Өдрийн төлөвлөгөөний маршрутыг сонгосон овоолгын маршрутаас авна (stockpiles.route_id, 0087).
-- Овоолго маршрутгүй бол төлөвлөгөө маршрутгүй үүсч болно.

ALTER TABLE daily_plans
  ALTER COLUMN route_id DROP NOT NULL;
