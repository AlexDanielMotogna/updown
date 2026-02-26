-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('UPCOMING', 'JOINING', 'ACTIVE', 'RESOLVED', 'CLAIMABLE');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('UP', 'DOWN');

-- CreateTable
CREATE TABLE "pools" (
    "id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "status" "PoolStatus" NOT NULL DEFAULT 'UPCOMING',
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "lock_time" TIMESTAMP(3) NOT NULL,
    "strike_price" BIGINT,
    "final_price" BIGINT,
    "total_up" BIGINT NOT NULL DEFAULT 0,
    "total_down" BIGINT NOT NULL DEFAULT 0,
    "winner" "Side",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bets" (
    "id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "side" "Side" NOT NULL,
    "amount" BIGINT NOT NULL,
    "deposit_tx" TEXT,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claim_tx" TEXT,
    "payout_amount" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_snapshots" (
    "id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "raw_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_log" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pools_pool_id_key" ON "pools"("pool_id");

-- CreateIndex
CREATE UNIQUE INDEX "bets_pool_id_wallet_address_key" ON "bets"("pool_id", "wallet_address");

-- CreateIndex
CREATE INDEX "event_log_entity_type_entity_id_idx" ON "event_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "event_log_event_type_idx" ON "event_log"("event_type");

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
