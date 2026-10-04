ALTER TABLE "inspection_results" DROP CONSTRAINT "inspection_results_inspection_item_id_inspection_items_id_fk";
ALTER TABLE "vehicle_inspections" DROP CONSTRAINT "vehicle_inspections_inspection_id_inspection_templates_id_fk";
DO $$ BEGIN
 CREATE TYPE "public"."enum_vehicle_inspection_status" AS ENUM('normal', 'issue', 'needs_inspection');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspections" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vehicle_type" "enum_vehicle_type" NOT NULL,
	"inspection_type" varchar(255),
	"name" varchar(255),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shift_inspections" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"shift_id" uuid DEFAULT uuid_generate_v4() NOT NULL,
	"vehicle_id" uuid DEFAULT uuid_generate_v4() NOT NULL,
	"driver_id" uuid DEFAULT uuid_generate_v4() NOT NULL,
	"inspection_id" uuid DEFAULT uuid_generate_v4() NOT NULL,
	"status" "enum_vehicle_inspection_status" DEFAULT 'normal' NOT NULL,
	"notes" text,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DROP TABLE "inspection_items";--> statement-breakpoint
DROP TABLE "inspection_results";--> statement-breakpoint
DROP TABLE "inspection_templates";--> statement-breakpoint
DROP TABLE "vehicle_inspections";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspections" ADD CONSTRAINT "inspections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_inspections" ADD CONSTRAINT "shift_inspections_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_inspections" ADD CONSTRAINT "shift_inspections_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_inspections" ADD CONSTRAINT "shift_inspections_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_inspections" ADD CONSTRAINT "shift_inspections_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
