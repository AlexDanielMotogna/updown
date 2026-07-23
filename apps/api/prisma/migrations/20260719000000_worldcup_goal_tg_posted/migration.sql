-- Track which goals were already announced to the Telegram live feed (dedup across restarts).
ALTER TABLE "worldcup_goal_cache" ADD COLUMN "tg_posted_keys" JSONB NOT NULL DEFAULT '[]';
