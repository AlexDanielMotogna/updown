-- Cross-chain funding transfers (Solana USDC -> EVM/HyperLiquid) lifecycle.
CREATE TABLE "bridge_transfers" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "from_chain" TEXT NOT NULL,
    "to_chain" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "to_amount" TEXT,
    "source_tx_hash" TEXT,
    "dest_tx_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bridge_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bridge_transfers_wallet_address_idx" ON "bridge_transfers"("wallet_address");
