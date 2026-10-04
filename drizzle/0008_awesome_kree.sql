DO $$ BEGIN
 CREATE TYPE "public"."enum_vehicle_picture_angle" AS ENUM('front', 'rear', 'left', 'right', 'left_front', 'right_front', 'left_rear', 'right_rear');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "enum_vehicle_type" ADD VALUE 'dump';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mining_sections" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255) NOT NULL,
	"organization_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicle_organizations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicle_pictures" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"url" varchar(1024) NOT NULL,
	"position" "enum_vehicle_picture_angle",
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "serial_number" varchar(255);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "engine_number" varchar(255);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "vehicle_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "mining_section_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "model" varchar(255);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "brand" varchar(255);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "commissioning_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "decommissioning_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "stopped_moto_hours" numeric;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "has_gps" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "gps_id" varchar(255);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "gps_group_id" varchar(255);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "gps_name" varchar(255);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "has_buzzer" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "has_fuel_sensor" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "fuel_consumption_per_hour" numeric;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mining_sections" ADD CONSTRAINT "mining_sections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicle_pictures" ADD CONSTRAINT "vehicle_pictures_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vehicle_organization_id_vehicle_organizations_id_fk" FOREIGN KEY ("vehicle_organization_id") REFERENCES "public"."vehicle_organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_mining_section_id_mining_sections_id_fk" FOREIGN KEY ("mining_section_id") REFERENCES "public"."mining_sections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
