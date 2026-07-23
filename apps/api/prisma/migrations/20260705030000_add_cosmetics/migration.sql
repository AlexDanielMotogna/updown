-- CreateEnum
CREATE TYPE "CosmeticKind" AS ENUM ('BADGE', 'FRAME', 'TITLE', 'NAME_COLOR');

-- CreateTable
CREATE TABLE "cosmetics" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "kind" "CosmeticKind" NOT NULL,
    "name" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "value" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cosmetics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_cosmetics" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "cosmetic_id" TEXT NOT NULL,
    "kind" "CosmeticKind" NOT NULL,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_cosmetics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cosmetics_sku_key" ON "cosmetics"("sku");

-- CreateIndex
CREATE INDEX "user_cosmetics_wallet_address_idx" ON "user_cosmetics"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "user_cosmetics_wallet_address_cosmetic_id_key" ON "user_cosmetics"("wallet_address", "cosmetic_id");

-- AddForeignKey
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_cosmetic_id_fkey" FOREIGN KEY ("cosmetic_id") REFERENCES "cosmetics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
