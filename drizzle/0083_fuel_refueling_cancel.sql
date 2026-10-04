ALTER TABLE "fuel_refuelings" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
ALTER TABLE "fuel_refuelings" ADD COLUMN IF NOT EXISTS "cancelled_by" uuid;
ALTER TABLE "fuel_refuelings" ADD COLUMN IF NOT EXISTS "cancel_reason" text;
DO $$ BEGIN
 ALTER TABLE "fuel_refuelings" ADD CONSTRAINT "fuel_refuelings_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
