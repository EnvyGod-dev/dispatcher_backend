ALTER TABLE "monthly_plans" RENAME COLUMN "transport_amount" TO "coal_amount";--> statement-breakpoint
ALTER TABLE "monthly_plans" ADD COLUMN "soil_amount" numeric;