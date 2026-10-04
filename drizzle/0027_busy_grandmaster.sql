ALTER TABLE "mining_blocks" ADD COLUMN "material_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mining_blocks" ADD CONSTRAINT "mining_blocks_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "mining_blocks" DROP COLUMN IF EXISTS "material_name";--> statement-breakpoint
ALTER TABLE "mining_blocks" DROP COLUMN IF EXISTS "material_code";--> statement-breakpoint
ALTER TABLE "mining_blocks" DROP COLUMN IF EXISTS "material_type";