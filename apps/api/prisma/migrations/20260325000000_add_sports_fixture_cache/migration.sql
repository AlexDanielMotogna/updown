-- CreateTable
CREATE TABLE "sports_fixture_cache" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "league_name" TEXT NOT NULL,
    "season" INTEGER,
    "matchday" INTEGER,
    "home_team" TEXT NOT NULL,
    "away_team" TEXT NOT NULL,
    "home_team_crest" TEXT,
    "away_team_crest" TEXT,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "home_score" INTEGER,
    "away_score" INTEGER,
    "winner" TEXT,
    "api_source" TEXT NOT NULL DEFAULT 'football-data',
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_fixture_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sports_fixture_cache_external_id_sport_api_source_key" ON "sports_fixture_cache"("external_id", "sport", "api_source");

-- CreateIndex
CREATE INDEX "sports_fixture_cache_sport_league_kickoff_idx" ON "sports_fixture_cache"("sport", "league", "kickoff");

-- CreateIndex
CREATE INDEX "sports_fixture_cache_sport_league_status_idx" ON "sports_fixture_cache"("sport", "league", "status");

-- CreateIndex
CREATE INDEX "sports_fixture_cache_status_kickoff_idx" ON "sports_fixture_cache"("status", "kickoff");

-- CreateIndex
CREATE INDEX "sports_fixture_cache_external_id_idx" ON "sports_fixture_cache"("external_id");
