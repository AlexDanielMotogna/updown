-- CreateTable
CREATE TABLE "worldcup_results" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "home_score" INTEGER NOT NULL,
    "away_score" INTEGER NOT NULL,
    "phase" "WorldCupPhase" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worldcup_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worldcup_winners" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "contest_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worldcup_winners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worldcup_results_match_id_key" ON "worldcup_results"("match_id");

-- CreateIndex
CREATE INDEX "worldcup_winners_match_id_idx" ON "worldcup_winners"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "worldcup_winners_match_id_contest_user_id_key" ON "worldcup_winners"("match_id", "contest_user_id");
