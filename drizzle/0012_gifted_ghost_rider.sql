ALTER TABLE "shifts" ADD COLUMN "moto_start" numeric;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "moto_end" numeric;--> statement-breakpoint
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "moto_timestamp_start";--> statement-breakpoint
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "moto_timestamp_end";