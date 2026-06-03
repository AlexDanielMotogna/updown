-- Add Polymarket's CTF conditionId to the fixture cache. CTF (Conditional
-- Tokens Framework, 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045 on Polygon)
-- is the canonical settlement layer for every Polymarket market regardless
-- of which UMA adapter wrapped the request. Reading payoutNumerators /
-- payoutDenominator there gives a 100% reliable resolution check, which is
-- the basis for services/polymarket/ctf-resolver.ts.
--
-- The earlier question_id column (added in 20260603010000) targeted the
-- UmaCtfAdapter directly, but Polymarket runs several adapters and the
-- mapping is per-market via Gamma's resolvedBy field — so question_id
-- alone wasn't enough. condition_id replaces it as the primary key the
-- resolver uses. question_id stays in the schema for now (cheap, may be
-- useful for OO V2 fallback later).

ALTER TABLE "sports_fixture_cache"
  ADD COLUMN "condition_id" TEXT;
