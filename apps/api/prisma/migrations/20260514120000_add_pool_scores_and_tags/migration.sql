-- AlterTable
ALTER TABLE "pools" ADD COLUMN IF NOT EXISTS "home_score" INTEGER;
ALTER TABLE "pools" ADD COLUMN IF NOT EXISTS "away_score" INTEGER;
ALTER TABLE "pools" ADD COLUMN IF NOT EXISTS "tags" TEXT;

-- AlterTable
ALTER TABLE "sports_fixture_cache" ADD COLUMN IF NOT EXISTS "tags" TEXT;
