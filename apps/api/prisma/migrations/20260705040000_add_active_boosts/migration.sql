-- CreateEnum
CREATE TYPE "BoostKind" AS ENUM ('XP', 'COINS');

-- CreateTable
CREATE TABLE "active_boosts" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "kind" "BoostKind" NOT NULL,
    "multiplier_bps" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "active_boosts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "active_boosts_wallet_address_idx" ON "active_boosts"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "active_boosts_wallet_address_kind_key" ON "active_boosts"("wallet_address", "kind");
