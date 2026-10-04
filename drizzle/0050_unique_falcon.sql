ALTER TABLE "shifts" DROP CONSTRAINT "shifts_plan_id_daily_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "soil_product" numeric;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "coal_product" numeric;--> statement-breakpoint
ALTER TABLE "work_logs" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_plan_id_daily_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "plan_id";--> statement-breakpoint
ALTER TABLE "work_logs" DROP COLUMN IF EXISTS "transportedAmount";