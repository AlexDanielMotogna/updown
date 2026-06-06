-- Retag existing Polymarket pools to the first-class POLYMARKET discriminator.
-- PM pools were historically stored as poolType 'SPORTS' with a league of the
-- form 'PM_*'. Backslash escapes the LIKE wildcard so we match a literal "PM_".
UPDATE "pools"
SET "pool_type" = 'POLYMARKET'
WHERE "pool_type" = 'SPORTS' AND "league" LIKE 'PM\_%';
