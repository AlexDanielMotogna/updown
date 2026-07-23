-- CreateTable
CREATE TABLE "emission_daily" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "distributed" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emission_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emission_daily_day_key" ON "emission_daily"("day");
