-- Manual moderation for World Cup contest: admin-set ban flag (excludes from raffle).
ALTER TABLE "contest_users" ADD COLUMN "banned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contest_users" ADD COLUMN "banned_at" TIMESTAMP(3);
