CREATE TABLE IF NOT EXISTS "stockpile_layers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"stockpile_id" uuid NOT NULL,
	"layer_number" varchar,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_logs" ADD COLUMN "stockpile_layer_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stockpile_layers" ADD CONSTRAINT "stockpile_layers_stockpile_id_stockpiles_id_fk" FOREIGN KEY ("stockpile_id") REFERENCES "public"."stockpiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_stockpile_layer_id_stockpile_layers_id_fk" FOREIGN KEY ("stockpile_layer_id") REFERENCES "public"."stockpile_layers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "stockpiles" DROP COLUMN IF EXISTS "layer_number";