ALTER TABLE "daily_plans" ALTER COLUMN "vehicle_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "markshader_daily_reports" DROP COLUMN IF EXISTS "dumping_site_measurement";--> statement-breakpoint
ALTER TABLE "markshader_daily_reports" DROP COLUMN IF EXISTS "markshader_discrepancy";