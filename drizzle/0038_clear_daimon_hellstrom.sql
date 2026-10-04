ALTER TABLE "users" RENAME COLUMN "user_name" TO "username";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET DATA TYPE text;