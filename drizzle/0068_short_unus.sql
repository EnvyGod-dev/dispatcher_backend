ALTER TABLE "vehicles" ADD COLUMN "insurance_expiry_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monthly_plans" DROP COLUMN IF EXISTS "date";