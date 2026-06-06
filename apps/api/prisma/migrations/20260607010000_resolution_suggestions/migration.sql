-- CreateTable
CREATE TABLE "resolution_suggestions" (
    "id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "match_id" TEXT,
    "home_team" TEXT NOT NULL,
    "away_team" TEXT NOT NULL,
    "league" TEXT,
    "match_date" TEXT NOT NULL,
    "home_score" INTEGER NOT NULL,
    "away_score" INTEGER NOT NULL,
    "suggested_winner" TEXT NOT NULL,
    "finished" BOOLEAN NOT NULL,
    "confident" BOOLEAN NOT NULL,
    "note" TEXT,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resolution_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resolution_suggestions_pool_id_key" ON "resolution_suggestions"("pool_id");

-- CreateIndex
CREATE INDEX "resolution_suggestions_status_idx" ON "resolution_suggestions"("status");
