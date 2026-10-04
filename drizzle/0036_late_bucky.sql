
ALTER TABLE "users" ALTER COLUMN "phone_number" SET DATA TYPE bigint USING phone_number::bigint;
ALTER TABLE "users" DROP COLUMN IF EXISTS "user_name";