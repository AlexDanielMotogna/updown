-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('XP', 'COINS');

-- CreateEnum
CREATE TYPE "RewardReason" AS ENUM ('BET_PLACED', 'BET_WON', 'CLAIM_COMPLETED', 'DAILY_BONUS', 'WIN_STREAK', 'LEVEL_UP');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "total_xp" BIGINT NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "coins_balance" BIGINT NOT NULL DEFAULT 0,
    "coins_lifetime" BIGINT NOT NULL DEFAULT 0,
    "coins_redeemed" BIGINT NOT NULL DEFAULT 0,
    "total_bets" INTEGER NOT NULL DEFAULT 0,
    "total_wins" INTEGER NOT NULL DEFAULT 0,
    "total_wagered" BIGINT NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "last_active_date" TIMESTAMP(3),
    "daily_bet_count" INTEGER NOT NULL DEFAULT 0,
    "daily_coins" BIGINT NOT NULL DEFAULT 0,
    "daily_reset_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_logs" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "reward_type" "RewardType" NOT NULL,
    "reason" "RewardReason" NOT NULL,
    "amount" BIGINT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emission_configs" (
    "id" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "coins_per_usdc_bet" BIGINT NOT NULL,
    "win_multiplier" INTEGER NOT NULL,
    "daily_coins_cap" BIGINT NOT NULL,
    "epoch_start_date" TIMESTAMP(3) NOT NULL,
    "epoch_end_date" TIMESTAMP(3),
    "total_allocated" BIGINT NOT NULL DEFAULT 0,
    "total_distributed" BIGINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "emission_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE INDEX "users_level_idx" ON "users"("level");

-- CreateIndex
CREATE INDEX "users_coins_lifetime_idx" ON "users"("coins_lifetime");

-- CreateIndex
CREATE INDEX "users_total_xp_idx" ON "users"("total_xp");

-- CreateIndex
CREATE INDEX "reward_logs_wallet_address_created_at_idx" ON "reward_logs"("wallet_address", "created_at");

-- CreateIndex
CREATE INDEX "reward_logs_reward_type_idx" ON "reward_logs"("reward_type");

-- CreateIndex
CREATE UNIQUE INDEX "emission_configs_epoch_key" ON "emission_configs"("epoch");

-- AddForeignKey
ALTER TABLE "reward_logs" ADD CONSTRAINT "reward_logs_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;
