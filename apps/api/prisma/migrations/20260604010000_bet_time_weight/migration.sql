-- Mirror of the on-chain UserBet.weight + per-deposit multiplier_bps
-- emitted by the new Deposited event. Captured by the deposit confirm
-- route so we can run sniper-rate / entry-time analytics without an
-- RPC per bet. Both columns nullable so legacy bets keep working — the
-- chain holds the authoritative value either way.

ALTER TABLE "bets" ADD COLUMN "weight" BIGINT;
ALTER TABLE "bets" ADD COLUMN "entry_multiplier_bps" INTEGER;
