ALTER TABLE "daily_plans" DROP CONSTRAINT "daily_plans_drop_off_block_id_mining_blocks_id_fk";
--> statement-breakpoint
ALTER TABLE "mining_blocks" ALTER COLUMN "name" SET DEFAULT 'pick_up';--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "drop_off_material_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_drop_off_material_id_materials_id_fk" FOREIGN KEY ("drop_off_material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "daily_plans" DROP COLUMN IF EXISTS "drop_off_block_id";