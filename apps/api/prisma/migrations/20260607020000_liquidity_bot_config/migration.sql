-- CreateTable
CREATE TABLE "liquidity_bot_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "perPoolCap" BIGINT NOT NULL DEFAULT 5000000,
    "perCycleCap" BIGINT NOT NULL DEFAULT 20000000,
    "maxTotalExposure" BIGINT NOT NULL DEFAULT 200000000,
    "treasuryFloor" BIGINT NOT NULL DEFAULT 25000000,
    "betMin" BIGINT NOT NULL DEFAULT 500000,
    "betMax" BIGINT NOT NULL DEFAULT 3000000,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 20,
    "lockMarginSeconds" INTEGER NOT NULL DEFAULT 15,
    "walletUsdcTopup" BIGINT NOT NULL DEFAULT 50000000,
    "walletSolTopup" INTEGER NOT NULL DEFAULT 50000000,
    "poolTypesCrypto" BOOLEAN NOT NULL DEFAULT true,
    "poolTypesSports" BOOLEAN NOT NULL DEFAULT true,
    "poolTypesPm" BOOLEAN NOT NULL DEFAULT true,
    "sideStrategy" TEXT NOT NULL DEFAULT 'balanced',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidity_bot_config_pkey" PRIMARY KEY ("id")
);
