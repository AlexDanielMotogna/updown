-- CreateTable
CREATE TABLE "worldcup_penalty_cache" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "home_pens" INTEGER,
    "away_pens" INTEGER,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worldcup_penalty_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worldcup_penalty_cache_match_id_key" ON "worldcup_penalty_cache"("match_id");
