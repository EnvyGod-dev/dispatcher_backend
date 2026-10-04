DO $$ BEGIN
 CREATE TYPE "public"."enum_mining_block_material_type" AS ENUM('coal', 'soil');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "vehicle_type" "enum_vehicle_type";--> statement-breakpoint
ALTER TABLE "mining_blocks" ADD COLUMN "material_type" "enum_mining_block_material_type" DEFAULT 'soil' NOT NULL;