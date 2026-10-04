ALTER TABLE "users" ADD COLUMN "name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "deleted_at";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "website";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "address";