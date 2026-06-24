-- X PPU bills tweets WITH a URL as "ContentCreateWithUrl" (pricier). Default the
-- poster to plain text (no link) and turn it off on any existing config row.
ALTER TABLE "x_poster_config" ALTER COLUMN "includeLink" SET DEFAULT false;
UPDATE "x_poster_config" SET "includeLink" = false;
