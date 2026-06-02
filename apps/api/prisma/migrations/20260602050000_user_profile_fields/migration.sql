-- Self-edited profile fields on User. display_name is unique so the
-- leaderboard / activity feed can render it unambiguously while the wallet
-- address remains the canonical identity. avatar_url and banner_url are
-- arbitrary Cloudinary (or pasted) URLs — no server-side image storage.

ALTER TABLE "users"
  ADD COLUMN "display_name" TEXT,
  ADD COLUMN "avatar_url"   TEXT,
  ADD COLUMN "banner_url"   TEXT;

CREATE UNIQUE INDEX "users_display_name_key" ON "users"("display_name");
