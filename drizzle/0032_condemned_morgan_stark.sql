ALTER TABLE "daily_plans" DROP CONSTRAINT "daily_plans_drop_off_material_id_materials_id_fk";

DO $$ BEGIN
 CREATE TYPE "public"."enum_stockpile_type" AS ENUM('coal', 'soil');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stockpiles" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "enum_stockpile_type" NOT NULL,
	"layer_number" varchar(255),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DROP TABLE "materials";--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "stockpile_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "work_logs" ADD COLUMN "vehicle_coefficient" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stockpiles" ADD CONSTRAINT "stockpiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stockpiles" ADD CONSTRAINT "stockpiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_stockpile_id_stockpiles_id_fk" FOREIGN KEY ("stockpile_id") REFERENCES "public"."stockpiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "daily_plans" DROP COLUMN IF EXISTS "drop_off_material_id";