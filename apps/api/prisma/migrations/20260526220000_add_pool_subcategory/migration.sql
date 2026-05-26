-- AlterTable
ALTER TABLE "pools" ADD COLUMN IF NOT EXISTS "subcategory" TEXT;

-- AlterTable
ALTER TABLE "sports_fixture_cache" ADD COLUMN IF NOT EXISTS "subcategory" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pools_league_subcategory_idx" ON "pools"("league", "subcategory");
