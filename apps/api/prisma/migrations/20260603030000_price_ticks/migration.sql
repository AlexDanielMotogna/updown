-- Persistent backing store for the price-history ring buffer
-- (services/price-history.ts). Fed by a throttled writer (~5s/asset)
-- so after an API restart the scheduler can hydrate the buffer from
-- recent history and resolve pools at their actual endTime even when
-- the WebSocket subscription hasn't started pushing ticks yet.

CREATE TABLE "price_ticks" (
  "id"         TEXT PRIMARY KEY,
  "asset"      TEXT NOT NULL,
  "price"      TEXT NOT NULL,
  "timestamp"  TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "price_ticks_asset_timestamp_key" UNIQUE ("asset", "timestamp")
);

CREATE INDEX "price_ticks_asset_timestamp_idx" ON "price_ticks" ("asset", "timestamp" DESC);
