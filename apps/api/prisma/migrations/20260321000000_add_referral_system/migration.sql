-- AlterTable: Add referral fields to users
ALTER TABLE "users" ADD COLUMN "referral_code" TEXT,
ADD COLUMN "referred_by" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrer_wallet" TEXT NOT NULL,
    "referred_wallet" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referred_wallet_key" ON "referrals"("referred_wallet");

-- CreateIndex
CREATE INDEX "referrals_referrer_wallet_created_at_idx" ON "referrals"("referrer_wallet", "created_at");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_wallet_fkey" FOREIGN KEY ("referrer_wallet") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_wallet_fkey" FOREIGN KEY ("referred_wallet") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "referral_earnings" (
    "id" TEXT NOT NULL,
    "referrer_wallet" TEXT NOT NULL,
    "referred_wallet" TEXT NOT NULL,
    "bet_id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "fee_amount" BIGINT NOT NULL,
    "commission_bps" INTEGER NOT NULL DEFAULT 2000,
    "commission_amount" BIGINT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_tx" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_earnings_referrer_wallet_created_at_idx" ON "referral_earnings"("referrer_wallet", "created_at");

-- CreateIndex
CREATE INDEX "referral_earnings_paid_idx" ON "referral_earnings"("paid");

-- CreateTable
CREATE TABLE "referral_payouts" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "tx_signature" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_payouts_wallet_address_idx" ON "referral_payouts"("wallet_address");
