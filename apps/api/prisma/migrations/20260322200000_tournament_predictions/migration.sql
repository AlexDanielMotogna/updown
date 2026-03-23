-- Tournament prediction mechanic: replace UP/DOWN sides with price predictions

-- Drop old columns and constraints
ALTER TABLE "tournament_matches" DROP CONSTRAINT IF EXISTS "tournament_matches_pool_id_fkey";
DROP INDEX IF EXISTS "tournament_matches_pool_id_key";
DROP INDEX IF EXISTS "tournament_matches_pool_id_idx";

ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "player1_side";
ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "player2_side";
ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "pool_id";

-- Add prediction columns
ALTER TABLE "tournament_matches" ADD COLUMN "player1_prediction" BIGINT;
ALTER TABLE "tournament_matches" ADD COLUMN "player2_prediction" BIGINT;
ALTER TABLE "tournament_matches" ADD COLUMN "player1_predicted_at" TIMESTAMP(3);
ALTER TABLE "tournament_matches" ADD COLUMN "player2_predicted_at" TIMESTAMP(3);
ALTER TABLE "tournament_matches" ADD COLUMN "prediction_deadline" TIMESTAMP(3);

-- Add match timing columns (previously on Pool)
ALTER TABLE "tournament_matches" ADD COLUMN "start_time" TIMESTAMP(3);
ALTER TABLE "tournament_matches" ADD COLUMN "end_time" TIMESTAMP(3);
ALTER TABLE "tournament_matches" ADD COLUMN "strike_price" BIGINT;
ALTER TABLE "tournament_matches" ADD COLUMN "final_price" BIGINT;
