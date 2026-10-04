ALTER TABLE "monthly_plans" ADD COLUMN "year" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_plans" ADD COLUMN "month" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_plans" ADD COLUMN "date" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_org_year_month" ON "monthly_plans" ("organization_id","year","month");