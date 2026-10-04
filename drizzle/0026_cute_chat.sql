ALTER TABLE "materials" ADD COLUMN "pick_up_layer_number" numeric;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "drop_off_layer_number" numeric;--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN IF EXISTS "layer_number";