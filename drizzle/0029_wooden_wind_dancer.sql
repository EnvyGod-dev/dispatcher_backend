ALTER TABLE "materials" ADD COLUMN "layer_number" varchar(255);--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN IF EXISTS "pick_up_layer_number";