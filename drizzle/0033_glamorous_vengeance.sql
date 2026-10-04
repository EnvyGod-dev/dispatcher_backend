ALTER TABLE "mining_blocks" ALTER COLUMN "name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "work_logs" DROP COLUMN IF EXISTS "vehicle_coefficient";