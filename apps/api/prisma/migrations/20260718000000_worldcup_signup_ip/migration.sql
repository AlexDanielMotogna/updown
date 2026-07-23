-- World Cup contest anti-abuse: record signup IP so we can cap how many
-- participating accounts share one IP (free email login is farmable for raffle entries).
ALTER TABLE "contest_users" ADD COLUMN "signup_ip" TEXT;
CREATE INDEX "contest_users_signup_ip_idx" ON "contest_users"("signup_ip");
