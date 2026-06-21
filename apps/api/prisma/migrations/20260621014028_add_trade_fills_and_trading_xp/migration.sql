-- AlterEnum
ALTER TYPE "RewardReason" ADD VALUE 'TRADE_VOLUME';

-- AlterTable
ALTER TABLE "exchange_connections" ADD COLUMN "last_fill_time" BIGINT;

-- CreateTable
CREATE TABLE "trade_fills" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "account_address" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'hyperliquid',
    "tid" BIGINT NOT NULL,
    "coin" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "px" TEXT NOT NULL,
    "sz" TEXT NOT NULL,
    "notional_usd" TEXT NOT NULL,
    "fee_usd" TEXT NOT NULL,
    "pnl_usd" TEXT,
    "dir" TEXT,
    "xp_awarded" BIGINT NOT NULL DEFAULT 0,
    "time" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_fills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trade_fills_tid_key" ON "trade_fills"("tid");

-- CreateIndex
CREATE INDEX "trade_fills_wallet_address_time_idx" ON "trade_fills"("wallet_address", "time");

-- CreateIndex
CREATE INDEX "trade_fills_account_address_time_idx" ON "trade_fills"("account_address", "time");

-- AddForeignKey
ALTER TABLE "trade_fills" ADD CONSTRAINT "trade_fills_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;
