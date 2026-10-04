ALTER TYPE "enum_vehicle_type" ADD VALUE 'specialPurpose';--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "mine_number" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "model";--> statement-breakpoint
ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "brand";