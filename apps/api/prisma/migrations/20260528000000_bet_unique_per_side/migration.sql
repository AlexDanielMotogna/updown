-- Allow a wallet to hold a position on multiple sides of the same pool (hedge).
-- The on-chain UserBet PDA now includes the side, so the DB mirrors it 1:1 with
-- one row per (pool, wallet, side).

-- DropIndex
DROP INDEX "bets_pool_id_wallet_address_key";

-- CreateIndex
CREATE UNIQUE INDEX "bets_pool_id_wallet_address_side_key" ON "bets"("pool_id", "wallet_address", "side");
