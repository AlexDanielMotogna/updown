-- CreateTable
CREATE TABLE "uptime_checks" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "services" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uptime_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uptime_checks_created_at_idx" ON "uptime_checks"("created_at");
