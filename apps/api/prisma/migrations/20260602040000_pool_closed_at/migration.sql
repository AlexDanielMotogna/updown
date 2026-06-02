-- Add closed_at marker on Pool. Set by the scheduler once the on-chain PDA
-- is confirmed closed (real close OR AccountNotInitialized auto_cleanup).
-- Stops the RESOLVED <-> CLAIMABLE oscillation that was logging
-- POOL_CLOSED auto_cleanup every ~30s per already-closed pool.

ALTER TABLE "pools" ADD COLUMN "closed_at" TIMESTAMP(3);

-- Backfill: any pool that has at least one POOL_CLOSED event in the log
-- has been through closure already, so it must not be revived again.
UPDATE "pools" p
SET    "closed_at" = sub.last_closed_at
FROM (
  SELECT "entity_id" AS pool_id, MAX("created_at") AS last_closed_at
  FROM   "event_log"
  WHERE  "event_type" = 'POOL_CLOSED'
  GROUP  BY "entity_id"
) sub
WHERE  p."id" = sub.pool_id
  AND  p."closed_at" IS NULL;

CREATE INDEX "pools_status_closed_at_idx" ON "pools"("status", "closed_at");
