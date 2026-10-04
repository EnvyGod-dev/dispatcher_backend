ALTER TABLE "work_logs" DROP CONSTRAINT "work_logs_plan_id_daily_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "work_logs" DROP COLUMN IF EXISTS "plan_id";