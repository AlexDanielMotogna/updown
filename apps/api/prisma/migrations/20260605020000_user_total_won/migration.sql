-- Lifetime payout received (winning + refund claims). Net profit =
-- total_won - total_wagered. Backed by scripts/backfill-total-won for
-- historical rows; incremented on each claim going forward.
ALTER TABLE "users" ADD COLUMN "total_won" BIGINT NOT NULL DEFAULT 0;
