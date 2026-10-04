ALTER TABLE "routes" DROP CONSTRAINT "routes_blast_block_id_mining_blocks_id_fk";
--> statement-breakpoint
ALTER TABLE "routes" DROP CONSTRAINT "routes_stockpile_block_id_mining_blocks_id_fk";
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "description" varchar(255);--> statement-breakpoint
ALTER TABLE "routes" DROP COLUMN IF EXISTS "blast_block_id";--> statement-breakpoint
ALTER TABLE "routes" DROP COLUMN IF EXISTS "stockpile_block_id";