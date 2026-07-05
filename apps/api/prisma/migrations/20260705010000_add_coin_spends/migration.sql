-- CreateTable
CREATE TABLE "coin_spends" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sku" TEXT,
    "amount" BIGINT NOT NULL,
    "burned" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_spends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coin_spends_idempotency_key_key" ON "coin_spends"("idempotency_key");

-- CreateIndex
CREATE INDEX "coin_spends_wallet_address_created_at_idx" ON "coin_spends"("wallet_address", "created_at");

-- CreateIndex
CREATE INDEX "coin_spends_type_idx" ON "coin_spends"("type");
