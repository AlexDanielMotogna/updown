-- Multi-winner podium: each week awards tiered prizes to the top N.
ALTER TABLE "crypto_event_winners" ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "crypto_event_winners" ADD COLUMN "prize" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "crypto_referral_winners" ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "crypto_referral_winners" ADD COLUMN "prize" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing single winners with their prior prize amount (rank 1).
UPDATE "crypto_event_winners" SET "prize" = 100 WHERE "prize" = 0;
UPDATE "crypto_referral_winners" SET "prize" = 50 WHERE "prize" = 0;

-- Replace the per-week unique with per-(week, rank) so a podium can co-exist.
DROP INDEX IF EXISTS "crypto_event_winners_week_start_key";
DROP INDEX IF EXISTS "crypto_referral_winners_week_start_key";
CREATE UNIQUE INDEX "crypto_event_winners_week_start_rank_key" ON "crypto_event_winners"("week_start", "rank");
CREATE UNIQUE INDEX "crypto_referral_winners_week_start_rank_key" ON "crypto_referral_winners"("week_start", "rank");
