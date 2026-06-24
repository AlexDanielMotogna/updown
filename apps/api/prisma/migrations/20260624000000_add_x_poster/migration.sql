-- AlterTable: dedup flag so the X poster tweets each pool exactly once.
ALTER TABLE "pools" ADD COLUMN "x_posted_at" TIMESTAMP(3);

-- CreateTable: single-row config for the X (Twitter) auto-poster.
CREATE TABLE "x_poster_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 120,
    "perCycleCap" INTEGER NOT NULL DEFAULT 5,
    "postSports" BOOLEAN NOT NULL DEFAULT true,
    "postPm" BOOLEAN NOT NULL DEFAULT true,
    "postCrypto" BOOLEAN NOT NULL DEFAULT false,
    "includeLink" BOOLEAN NOT NULL DEFAULT true,
    "template" TEXT NOT NULL DEFAULT 'JUST IN: {title}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "x_poster_config_pkey" PRIMARY KEY ("id")
);
