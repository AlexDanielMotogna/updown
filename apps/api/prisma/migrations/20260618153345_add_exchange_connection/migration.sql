-- CreateTable
CREATE TABLE "exchange_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "account_address" TEXT NOT NULL,
    "agent_address" TEXT NOT NULL,
    "agent_name" TEXT,
    "encrypted_key_data" TEXT NOT NULL,
    "is_testnet" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "approved_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_connections_account_address_idx" ON "exchange_connections"("account_address");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_connections_user_id_exchange_is_testnet_key" ON "exchange_connections"("user_id", "exchange", "is_testnet");

-- AddForeignKey
ALTER TABLE "exchange_connections" ADD CONSTRAINT "exchange_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
