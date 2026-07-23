-- CreateEnum
CREATE TYPE "WorldCupPhase" AS ENUM ('REGULATION', 'EXTRA_TIME', 'PENALTIES');

-- CreateTable
CREATE TABLE "contest_users" (
    "id" TEXT NOT NULL,
    "privy_did" TEXT NOT NULL,
    "provider" TEXT,
    "x_handle" TEXT,
    "email" TEXT,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contest_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worldcup_predictions" (
    "id" TEXT NOT NULL,
    "contest_user_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "home_score" INTEGER NOT NULL,
    "away_score" INTEGER NOT NULL,
    "phase" "WorldCupPhase" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worldcup_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contest_users_privy_did_key" ON "contest_users"("privy_did");

-- CreateIndex
CREATE INDEX "worldcup_predictions_match_id_idx" ON "worldcup_predictions"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "worldcup_predictions_contest_user_id_match_id_key" ON "worldcup_predictions"("contest_user_id", "match_id");

-- AddForeignKey
ALTER TABLE "worldcup_predictions" ADD CONSTRAINT "worldcup_predictions_contest_user_id_fkey" FOREIGN KEY ("contest_user_id") REFERENCES "contest_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
