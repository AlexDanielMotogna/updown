-- Combat-sport fighter image cache, keyed by normalized name.
--
-- Why a separate table instead of fields on sports_fixture_cache:
--   1. The same fighter appears across many events (Tommy Fury fights
--      multiple times; Conor McGregor is in dozens of UFC events). One
--      row per fighter = one SDB lookup per fighter, not per event.
--   2. Negative cache: when SDB has no profile for a fighter (typo,
--      unranked debut, etc.) we want to remember the miss so we don't
--      re-query every sync cycle.
--   3. Fighter photos almost never change, so a long TTL works.
--
-- The fixture cache (and downstream Pool rows) still store the final
-- image URL on home_team_crest / away_team_crest — those columns already
-- exist and downstream code reads them. Combat sports just populate them
-- from this table instead of leaving NULL.
CREATE TABLE "fighter_image_cache" (
  "name_key"        TEXT PRIMARY KEY,            -- normalized: lowercase, single-space
  "display_name"    TEXT NOT NULL,               -- original casing from the first hit
  "sport"           TEXT NOT NULL,               -- 'Fighting' for SDB combat
  "id_player"       TEXT,                        -- SDB idPlayer when matched
  "team"            TEXT,                        -- 'UFC Welterweight' etc., useful for UI
  "thumb_url"       TEXT,                        -- strThumb (jpg headshot)
  "cutout_url"      TEXT,                        -- strCutout (png, no background, preferred)
  "not_found"       BOOLEAN NOT NULL DEFAULT false,
  "last_fetched_at" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX "fighter_image_cache_sport_idx" ON "fighter_image_cache" ("sport");
CREATE INDEX "fighter_image_cache_not_found_idx" ON "fighter_image_cache" ("not_found", "last_fetched_at");
