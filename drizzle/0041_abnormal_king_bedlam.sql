ALTER TYPE "enum_vehicle_type" ADD VALUE 'lightVehicle';--> statement-breakpoint
ALTER TABLE "mining_sections" ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "mining_sections" ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;