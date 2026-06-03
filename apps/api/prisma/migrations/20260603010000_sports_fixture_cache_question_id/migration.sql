-- Add the UMA questionID column to the Polymarket fixture cache. This is
-- the bytes32 key used by Polymarket's UmaCtfAdapter on Polygon (see
-- services/polymarket/uma-resolver.ts) so the resolution poll can read
-- the outcome straight from the oracle when Gamma drops the listing.
--
-- Nullable + no default — existing non-PM rows stay untouched, and PM
-- rows that pre-date this column fall through to the Gamma-only path
-- until the next sync backfills them.

ALTER TABLE "sports_fixture_cache"
  ADD COLUMN "question_id" TEXT;
