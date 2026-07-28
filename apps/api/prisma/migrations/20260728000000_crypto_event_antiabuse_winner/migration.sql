-- Crypto Predictions event: anti-abuse fields on users + weekly winner table.
ALTER TABLE "users" ADD COLUMN "signup_ip" TEXT;
ALTER TABLE "users" ADD COLUMN "banned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "banned_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "email" TEXT;
CREATE INDEX "users_signup_ip_idx" ON "users"("signup_ip");

CREATE TABLE "crypto_event_winners" (
    "id" TEXT NOT NULL,
    "week_start" TIMESTAMP(3) NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "pnl" BIGINT NOT NULL DEFAULT 0,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "paid_tx" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crypto_event_winners_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crypto_event_winners_week_start_key" ON "crypto_event_winners"("week_start");
CREATE INDEX "crypto_event_winners_wallet_address_idx" ON "crypto_event_winners"("wallet_address");
