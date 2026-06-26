-- Per-pool volume variance for the liquidity bot: instead of filling every pool
-- to perPoolCap (which makes all pools show the same volume, looks fake), each
-- pool targets a stable, per-pool-random fraction of the cap.
ALTER TABLE "liquidity_bot_config" ADD COLUMN "perPoolVariancePct" INTEGER NOT NULL DEFAULT 50;
