-- Persist the Polymarket CTF conditionId on the pool so resolution survives
-- Gamma delisting (settle on-chain via CTF without a live Gamma lookup).
ALTER TABLE "pools" ADD COLUMN "condition_id" TEXT;
