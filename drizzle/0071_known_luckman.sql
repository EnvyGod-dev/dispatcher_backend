DO $$ BEGIN
 CREATE TYPE "public"."enum_daily_plan_status" AS ENUM('active', 'completed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "status" "enum_daily_plan_status" DEFAULT 'active' NOT NULL;