-- AlterTable (pools - add market_odds, group_item_title if not exist)
ALTER TABLE "pools" ADD COLUMN IF NOT EXISTS "market_odds" DOUBLE PRECISION;
ALTER TABLE "pools" ADD COLUMN IF NOT EXISTS "group_item_title" TEXT;

-- AlterTable (sports_fixture_cache - add market_odds, group_item_title if not exist)
ALTER TABLE "sports_fixture_cache" ADD COLUMN IF NOT EXISTS "market_odds" DOUBLE PRECISION;
ALTER TABLE "sports_fixture_cache" ADD COLUMN IF NOT EXISTS "group_item_title" TEXT;
