-- Event-bot closing play: late winning-side bets + single-side split config.
ALTER TABLE "event_bot_config" ADD COLUMN "closingBetEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "event_bot_config" ADD COLUMN "closingWindowSeconds" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "event_bot_config" ADD COLUMN "closingSafetySeconds" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "event_bot_config" ADD COLUMN "closingPerPoolCap" BIGINT NOT NULL DEFAULT 12000000;
ALTER TABLE "event_bot_config" ADD COLUMN "closingBetMin" BIGINT NOT NULL DEFAULT 1000000;
ALTER TABLE "event_bot_config" ADD COLUMN "closingBetMax" BIGINT NOT NULL DEFAULT 4000000;
