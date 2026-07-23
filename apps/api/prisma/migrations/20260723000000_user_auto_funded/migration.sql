-- Crypto Predictions event: one-time auto-fund marker (1000 test USDC on first login).
ALTER TABLE "users" ADD COLUMN "auto_funded_at" TIMESTAMP(3);
