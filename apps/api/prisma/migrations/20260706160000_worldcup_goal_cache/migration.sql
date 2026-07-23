-- CreateTable
CREATE TABLE "worldcup_goal_cache" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "goals" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worldcup_goal_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worldcup_goal_cache_match_id_key" ON "worldcup_goal_cache"("match_id");
