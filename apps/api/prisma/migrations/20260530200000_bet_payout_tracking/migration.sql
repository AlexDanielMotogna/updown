-- Auto-payout tracking fields on Bet — populated by the scheduler's
-- autoClaimBets job. Manual-claim bets leave these at default (false / 0 / null).

ALTER TABLE "bets"
  ADD COLUMN "payout_failed"     BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN "payout_attempts"   INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN "last_attempted_at" TIMESTAMP(3);

-- Speeds up autoClaimBets queue scan (find unclaimed bets per pool that
-- haven't failed permanently yet).
CREATE INDEX "bets_pool_id_claimed_payout_failed_idx"
  ON "bets" ("pool_id", "claimed", "payout_failed");

-- Speeds up the admin "failed payouts" tab (list bets with failed=true,
-- sorted by last attempt for retry triage).
CREATE INDEX "bets_payout_failed_last_attempted_at_idx"
  ON "bets" ("payout_failed", "last_attempted_at");
