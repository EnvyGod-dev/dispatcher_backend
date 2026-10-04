ALTER TABLE "mining_blocks" ALTER COLUMN "material_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN IF EXISTS "drop_off_layer_number";