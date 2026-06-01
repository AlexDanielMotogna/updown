-- Add wallet-prefixed indexes on bets for admin user search + per-wallet
-- aggregates. Without these, every /api/admin/users/search hit scans the
-- entire bets table (now ~hundreds of thousands of rows on dev). See
-- PLAN-ADMIN-REFACTOR.md Phase 1 #7.
CREATE INDEX IF NOT EXISTS "bets_wallet_address_idx" ON "bets"("wallet_address");
CREATE INDEX IF NOT EXISTS "bets_wallet_address_created_at_idx" ON "bets"("wallet_address", "created_at");
