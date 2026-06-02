-- Hierarchy support for PoolCategory.
--
-- Two changes:
--   1. New parent_code column. NULL = top-level. A child points at its parent's
--      `code`. No FK on purpose — categories are operator-managed and we don't
--      want a parent rename to cascade-rewrite every child silently. The
--      application layer validates the reference.
--   2. New SPORT_GROUP `type` value, seeded with the standard sport umbrellas
--      (Football / Basketball / Ice Hockey / American Football / Baseball /
--      Fighting / Rugby / Tennis). These rows don't sync from SDB — they just
--      group their children in the public filter and in admin.
--
-- Existing leagues with type FOOTBALL_LEAGUE / SPORTSDB_SPORT get their
-- parent_code backfilled to the right umbrella. Backfill is idempotent (uses
-- WHERE on the empty case) so re-running is safe.

ALTER TABLE "pool_categories" ADD COLUMN IF NOT EXISTS "parent_code" TEXT;
CREATE INDEX IF NOT EXISTS "pool_categories_parent_code_idx" ON "pool_categories" ("parent_code");

-- Seed sport groups. ON CONFLICT keeps the migration idempotent across
-- environments where the operator might have created some of these manually.
INSERT INTO "pool_categories" (
  id, code, type, enabled, coming_soon, label, short_label, color, icon_key,
  num_sides, side_labels, sort_order, created_at, updated_at
) VALUES
  (gen_random_uuid(), 'FOOTBALL',          'SPORT_GROUP', true, false, 'Soccer',           'Soccer', '#22c55e', 'SportsSoccer',     3, ARRAY['Home','Draw','Away']::text[], 10, NOW(), NOW()),
  (gen_random_uuid(), 'BASKETBALL',        'SPORT_GROUP', true, false, 'Basketball',       'NBA',    '#fb923c', 'SportsBasketball', 2, ARRAY['Home','Away']::text[],        20, NOW(), NOW()),
  (gen_random_uuid(), 'ICE_HOCKEY',        'SPORT_GROUP', true, false, 'Ice Hockey',       'Hockey', '#60a5fa', 'SportsHockey',     2, ARRAY['Home','Away']::text[],        30, NOW(), NOW()),
  (gen_random_uuid(), 'AMERICAN_FOOTBALL', 'SPORT_GROUP', true, false, 'American Football','NFL',    '#a78bfa', 'SportsFootball',   2, ARRAY['Home','Away']::text[],        40, NOW(), NOW()),
  (gen_random_uuid(), 'BASEBALL',          'SPORT_GROUP', true, false, 'Baseball',         'MLB',    '#34d399', 'SportsBaseball',   2, ARRAY['Home','Away']::text[],        50, NOW(), NOW()),
  (gen_random_uuid(), 'FIGHTING',          'SPORT_GROUP', true, false, 'Fighting',         'Combat', '#f87171', 'SportsMma',        2, ARRAY['Home','Away']::text[],        60, NOW(), NOW()),
  (gen_random_uuid(), 'RUGBY',             'SPORT_GROUP', true, false, 'Rugby',            'Rugby',  '#22d3ee', 'SportsRugby',      3, ARRAY['Home','Draw','Away']::text[], 70, NOW(), NOW()),
  (gen_random_uuid(), 'TENNIS',            'SPORT_GROUP', true, false, 'Tennis',           'Tennis', '#fbbf24', 'SportsTennis',     2, ARRAY['Home','Away']::text[],        80, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Backfill parent_code on existing leagues. Operator can move things via the
-- admin Categories tab later if a code falls into a different group than this
-- default assigns.
UPDATE "pool_categories" SET parent_code = 'FOOTBALL'           WHERE type = 'FOOTBALL_LEAGUE' AND parent_code IS NULL;
UPDATE "pool_categories" SET parent_code = 'BASKETBALL'         WHERE code = 'NBA'   AND parent_code IS NULL;
UPDATE "pool_categories" SET parent_code = 'ICE_HOCKEY'         WHERE code = 'NHL'   AND parent_code IS NULL;
UPDATE "pool_categories" SET parent_code = 'AMERICAN_FOOTBALL'  WHERE code = 'NFL'   AND parent_code IS NULL;
UPDATE "pool_categories" SET parent_code = 'BASEBALL'           WHERE code = 'MLB'   AND parent_code IS NULL;
UPDATE "pool_categories" SET parent_code = 'FIGHTING'           WHERE code IN ('BOXIN', 'MMA') AND parent_code IS NULL;
UPDATE "pool_categories" SET parent_code = 'RUGBY'              WHERE code = 'RC'    AND parent_code IS NULL;
