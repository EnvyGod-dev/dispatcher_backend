ALTER TABLE "vehicles" ADD COLUMN "soil_coefficient" numeric;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "coal_coefficient" numeric;--> statement-breakpoint
ALTER TABLE "mining_blocks" DROP COLUMN IF EXISTS "density_measurement";--> statement-breakpoint
ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "payload_capacity";--> statement-breakpoint
ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "payload_capacity_measurement";