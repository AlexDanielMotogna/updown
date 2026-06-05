-- Farm-proof "active user" counter (real resolutions, not refunds).
ALTER TABLE "users" ADD COLUMN "settled_bets" INTEGER NOT NULL DEFAULT 0;

-- Idempotent UP airdrop ledger (20-bet reward, community milestones, …).
CREATE TABLE "reward_grants" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reward_grants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reward_grants_wallet_address_type_key" ON "reward_grants"("wallet_address", "type");
CREATE INDEX "reward_grants_type_idx" ON "reward_grants"("type");
