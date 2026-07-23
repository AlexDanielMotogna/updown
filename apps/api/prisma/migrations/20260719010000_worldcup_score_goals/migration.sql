-- Score-delta goal feed state (post goal on score change, edit in the scorer later).
ALTER TABLE "worldcup_goal_cache" ADD COLUMN "tg_score" JSONB NOT NULL DEFAULT '{}';
