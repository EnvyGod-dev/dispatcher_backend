ALTER TYPE "public"."enum_stockpile_type" ADD VALUE IF NOT EXISTS 'engineering';
ALTER TYPE "public"."enum_stockpile_type" ADD VALUE IF NOT EXISTS 'common';
ALTER TYPE "public"."enum_stockpile_type" ADD VALUE IF NOT EXISTS 'internal';
ALTER TYPE "public"."enum_stockpile_type" ADD VALUE IF NOT EXISTS 'unproductive';
ALTER TYPE "public"."enum_stockpile_type" ADD VALUE IF NOT EXISTS 'blast';
ALTER TYPE "public"."enum_stockpile_type" ADD VALUE IF NOT EXISTS 'humus';