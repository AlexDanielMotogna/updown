-- Consolidated catch-up migration: schema fields/tables that were declared in
-- schema.prisma but never had migrations generated (commits 008c4a4, b3ba011,
-- 1e8cf76, fd86405). Idempotent via IF NOT EXISTS.

-- ── Tournament: sport-aware fields (commit 008c4a4) ─────────────────────────
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "tournament_type" TEXT NOT NULL DEFAULT 'CRYPTO';
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "sport" TEXT;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "league" TEXT;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "match_config" TEXT;

-- ── TournamentMatch: sports tiebreaker + score columns (commit 008c4a4) ─────
ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "player1_total_goals" INTEGER;
ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "player2_total_goals" INTEGER;
ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "player1_score" INTEGER;
ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "player2_score" INTEGER;

-- ── tournament_round_fixtures (commit b3ba011 "Predict the Matchday") ───────
CREATE TABLE IF NOT EXISTS "tournament_round_fixtures" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "fixture_index" INTEGER NOT NULL,
    "football_match_id" TEXT NOT NULL,
    "home_team" TEXT NOT NULL,
    "away_team" TEXT NOT NULL,
    "home_team_crest" TEXT,
    "away_team_crest" TEXT,
    "kickoff" TIMESTAMP(3),
    "result_home" INTEGER,
    "result_away" INTEGER,
    "result_outcome" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tournament_round_fixtures_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tournament_round_fixtures_tournament_id_round_fixture_index_key"
    ON "tournament_round_fixtures"("tournament_id", "round", "fixture_index");
CREATE INDEX IF NOT EXISTS "tournament_round_fixtures_tournament_id_round_idx"
    ON "tournament_round_fixtures"("tournament_id", "round");
DO $$ BEGIN
    ALTER TABLE "tournament_round_fixtures"
        ADD CONSTRAINT "tournament_round_fixtures_tournament_id_fkey"
        FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── live_scores (commit 1e8cf76 "Livescore: DB persistence") ────────────────
CREATE TABLE IF NOT EXISTS "live_scores" (
    "event_id" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "home_team" TEXT NOT NULL,
    "away_team" TEXT NOT NULL,
    "home_score" INTEGER NOT NULL DEFAULT 0,
    "away_score" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "progress" TEXT NOT NULL DEFAULT '',
    "home_team_badge" TEXT NOT NULL DEFAULT '',
    "away_team_badge" TEXT NOT NULL DEFAULT '',
    "home_team_norm" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "live_scores_pkey" PRIMARY KEY ("event_id")
);
CREATE INDEX IF NOT EXISTS "live_scores_sport_status_idx" ON "live_scores"("sport", "status");
CREATE INDEX IF NOT EXISTS "live_scores_home_team_norm_idx" ON "live_scores"("home_team_norm");

-- ── notifications (commit fd86405 "Persistent notifications") ───────────────
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "pool_id" TEXT,
    "pool_type" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notifications_wallet_address_read_idx" ON "notifications"("wallet_address", "read");
CREATE INDEX IF NOT EXISTS "notifications_wallet_address_created_at_idx" ON "notifications"("wallet_address", "created_at");

-- ── sports_fixture_cache: index added later in schema ───────────────────────
CREATE INDEX IF NOT EXISTS "sports_fixture_cache_status_kickoff_idx"
    ON "sports_fixture_cache"("status", "kickoff");
CREATE INDEX IF NOT EXISTS "sports_fixture_cache_external_id_idx"
    ON "sports_fixture_cache"("external_id");
