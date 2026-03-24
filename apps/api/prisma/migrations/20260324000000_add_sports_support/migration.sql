-- AlterTable
ALTER TABLE "pools" ADD COLUMN "total_draw" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "pools" ADD COLUMN "num_sides" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "pools" ADD COLUMN "pool_type" TEXT NOT NULL DEFAULT 'CRYPTO';
ALTER TABLE "pools" ADD COLUMN "match_id" TEXT;
ALTER TABLE "pools" ADD COLUMN "home_team" TEXT;
ALTER TABLE "pools" ADD COLUMN "away_team" TEXT;
ALTER TABLE "pools" ADD COLUMN "league" TEXT;

-- AlterEnum
ALTER TYPE "Side" ADD VALUE 'DRAW';

-- CreateIndex
CREATE INDEX "pools_pool_type_idx" ON "pools"("pool_type");
