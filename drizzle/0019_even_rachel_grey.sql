ALTER TABLE "work_logs" DROP CONSTRAINT "work_logs_pick_up_block_id_mining_blocks_id_fk";
--> statement-breakpoint
ALTER TABLE "work_logs" DROP CONSTRAINT "work_logs_drop_off_block_id_mining_blocks_id_fk";
--> statement-breakpoint
ALTER TABLE "work_logs" ADD COLUMN "plan_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_plan_id_daily_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "work_logs" DROP COLUMN IF EXISTS "pick_up_block_id";--> statement-breakpoint
ALTER TABLE "work_logs" DROP COLUMN IF EXISTS "drop_off_block_id";