-- CreateTable
CREATE TABLE "wallet_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "source" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_links_user_id_idx" ON "wallet_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_links_chain_address_key" ON "wallet_links"("chain", "address");

-- AddForeignKey
ALTER TABLE "wallet_links" ADD CONSTRAINT "wallet_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
