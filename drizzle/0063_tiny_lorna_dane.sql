CREATE INDEX IF NOT EXISTS "idx_shift_inspections_shift_status" ON "shift_inspections" ("shift_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_shift_inspections_vehicle" ON "shift_inspections" ("vehicle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_shifts_org_created" ON "shifts" ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_shifts_org_status_created" ON "shifts" ("organization_id","shift_status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_shifts_driver" ON "shifts" ("driver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_shifts_vehicle" ON "shifts" ("vehicle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_work_logs_shift" ON "work_logs" ("shift_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_work_logs_stockpile" ON "work_logs" ("stockpile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_work_logs_plan" ON "work_logs" ("plan_id");