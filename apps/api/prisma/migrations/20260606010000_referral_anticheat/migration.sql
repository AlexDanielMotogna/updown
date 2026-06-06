-- Anti-cheat signals + flags on referrals (flag, not ban).
ALTER TABLE "referrals" ADD COLUMN "signup_ip" TEXT;
ALTER TABLE "referrals" ADD COLUMN "device_fingerprint" TEXT;
ALTER TABLE "referrals" ADD COLUMN "suspect" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "referrals" ADD COLUMN "suspect_reason" TEXT;
ALTER TABLE "referrals" ADD COLUMN "reviewed" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "referrals_device_fingerprint_idx" ON "referrals"("device_fingerprint");
CREATE INDEX "referrals_signup_ip_idx" ON "referrals"("signup_ip");
