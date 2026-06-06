-- Community milestones (Stone…Diamond). Rows are upserted from code config.
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "target_users" INTEGER NOT NULL,
    "reward_pool" BIGINT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "reached_user_count" INTEGER,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "milestones_key_key" ON "milestones"("key");
