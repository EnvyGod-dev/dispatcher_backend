DO $$ BEGIN
 CREATE TYPE "public"."enum_driver_shift_group" AS ENUM('A', 'B', 'C', 'D');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "driver_shift_group" "enum_driver_shift_group";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "driver_shift_group" "enum_driver_shift_group";