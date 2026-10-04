DO $$ BEGIN
 CREATE TYPE "public"."enum_mining_block_density_measurement" AS ENUM('tons', 'm3');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mining_blocks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(255) NOT NULL,
	"type" "enum_location_type" NOT NULL,
	"material_name" varchar(255) NOT NULL,
	"material_code" varchar(50) NOT NULL,
	"layer_number" varchar(20),
	"density_measurement" "enum_mining_block_density_measurement",
	"latitude" text,
	"longitude" text,
	"is_active" boolean DEFAULT true,
	"description" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_logs" DROP CONSTRAINT "work_logs_pick_up_location_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "work_logs" DROP CONSTRAINT "work_logs_drop_off_location_locations_id_fk";
DROP TABLE "locations";--> statement-breakpoint
DROP TABLE "materials";--> statement-breakpoint
ALTER TABLE "work_logs" RENAME COLUMN "tons_transported" TO "transportedAmount";--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "work_logs" ADD COLUMN "pick_up_block_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "work_logs" ADD COLUMN "drop_off_block_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mining_blocks" ADD CONSTRAINT "mining_blocks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_pick_up_block_id_mining_blocks_id_fk" FOREIGN KEY ("pick_up_block_id") REFERENCES "public"."mining_blocks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_drop_off_block_id_mining_blocks_id_fk" FOREIGN KEY ("drop_off_block_id") REFERENCES "public"."mining_blocks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "work_logs" DROP COLUMN IF EXISTS "pick_up_location";--> statement-breakpoint
ALTER TABLE "work_logs" DROP COLUMN IF EXISTS "drop_off_location";