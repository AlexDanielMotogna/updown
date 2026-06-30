-- Liquidity bot can be pinned to specific pools. When non-empty, the bot bets
-- ONLY on these Pool.id values (ignoring the poolTypes filter) until the list is
-- cleared or the bot is stopped. Empty array = default behavior (all open pools).
ALTER TABLE "liquidity_bot_config" ADD COLUMN "targetPoolIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
