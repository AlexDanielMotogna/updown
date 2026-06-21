-- CreateTable
CREATE TABLE "pool_creation_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "allow3m" BOOLEAN NOT NULL DEFAULT false,
    "allow5m" BOOLEAN NOT NULL DEFAULT false,
    "allow15m" BOOLEAN NOT NULL DEFAULT false,
    "allow1h" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pool_creation_config_pkey" PRIMARY KEY ("id")
);
