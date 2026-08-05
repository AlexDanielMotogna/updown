-- Event-native weekly referral prize winner (top-1 valid referrals per week).
CREATE TABLE "crypto_referral_winners" (
    "id" TEXT NOT NULL,
    "week_start" TIMESTAMP(3) NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "payout_wallet" TEXT,
    "valid_referrals" INTEGER NOT NULL DEFAULT 0,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "paid_tx" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crypto_referral_winners_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "crypto_referral_winners_week_start_key" ON "crypto_referral_winners"("week_start");
CREATE INDEX "crypto_referral_winners_wallet_address_idx" ON "crypto_referral_winners"("wallet_address");
