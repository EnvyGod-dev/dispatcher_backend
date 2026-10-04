ALTER TABLE "daily_plans" DROP CONSTRAINT "daily_plans_stockpile_id_stockpiles_id_fk";
--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "stockpile_ids" uuid[];--> statement-breakpoint
ALTER TABLE "daily_plans" DROP COLUMN IF EXISTS "stockpile_id";