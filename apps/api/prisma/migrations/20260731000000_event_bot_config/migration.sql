-- Event Bots config (crypto 5m event pools only).
CREATE TABLE "event_bot_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "perPoolCap" BIGINT NOT NULL DEFAULT 5000000,
    "perPoolVariancePct" INTEGER NOT NULL DEFAULT 50,
    "perCycleCap" BIGINT NOT NULL DEFAULT 20000000,
    "maxTotalExposure" BIGINT NOT NULL DEFAULT 200000000,
    "treasuryFloor" BIGINT NOT NULL DEFAULT 25000000,
    "betMin" BIGINT NOT NULL DEFAULT 500000,
    "betMax" BIGINT NOT NULL DEFAULT 3000000,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 30,
    "lockMarginSeconds" INTEGER NOT NULL DEFAULT 15,
    "walletUsdcTopup" BIGINT NOT NULL DEFAULT 50000000,
    "walletSolTopup" INTEGER NOT NULL DEFAULT 50000000,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_bot_config_pkey" PRIMARY KEY ("id")
);
