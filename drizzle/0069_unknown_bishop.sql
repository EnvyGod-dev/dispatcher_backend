
ALTER TABLE "shifts" ADD COLUMN "operational_date" date;--> statement-breakpoint
ALTER TABLE "daily_plans" ALTER COLUMN "date" TYPE date USING DATE("date");--> statement-breakpoint
UPDATE "shifts"
SET "operational_date" = COALESCE(
  (
    SELECT dp."date"
    FROM "work_logs" wl
    INNER JOIN "daily_plans" dp ON dp."id" = wl."plan_id"
    WHERE wl."shift_id" = "shifts"."id"
      AND dp."date" IS NOT NULL
    ORDER BY wl."created_at" ASC
    LIMIT 1
  ),
  DATE("shift_start"),
  DATE("created_at")
);--> statement-breakpoint
CREATE INDEX "idx_shifts_org_operational_date" ON "shifts" USING btree ("organization_id","operational_date");
