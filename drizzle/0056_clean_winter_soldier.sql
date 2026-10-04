ALTER TABLE "work_logs" RENAME COLUMN "stockpile_layer_id" TO "stockpile_id";--> statement-breakpoint
ALTER TABLE "work_logs" DROP CONSTRAINT "work_logs_stockpile_layer_id_stockpile_layers_id_fk";

DROP TABLE "stockpile_layers";--> statement-breakpoint
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_stockpile_id_stockpiles_id_fk" FOREIGN KEY ("stockpile_id") REFERENCES "public"."stockpiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
