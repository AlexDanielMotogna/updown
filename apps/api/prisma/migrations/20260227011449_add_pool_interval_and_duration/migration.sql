-- AlterTable
ALTER TABLE "pools" ADD COLUMN     "duration_seconds" INTEGER NOT NULL DEFAULT 3600,
ADD COLUMN     "interval" TEXT NOT NULL DEFAULT '1h';

-- CreateIndex
CREATE INDEX "pools_asset_interval_status_idx" ON "pools"("asset", "interval", "status");
