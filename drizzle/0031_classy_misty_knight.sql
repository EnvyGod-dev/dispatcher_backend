ALTER TABLE "mining_blocks" DROP CONSTRAINT "mining_blocks_material_id_materials_id_fk";
--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "vehicle_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "daily_plans" DROP COLUMN IF EXISTS "vehicle_type";--> statement-breakpoint
ALTER TABLE "mining_blocks" DROP COLUMN IF EXISTS "material_id";