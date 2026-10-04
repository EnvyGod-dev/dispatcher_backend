ALTER TYPE "enum_user_role" ADD VALUE 'manager';--> statement-breakpoint
ALTER TYPE "enum_user_role" ADD VALUE 'markscheider';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "user_name" varchar(255);