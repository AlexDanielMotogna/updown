-- CreateEnum
CREATE TYPE "SquadRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateTable
CREATE TABLE "squads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "invite_code" TEXT NOT NULL,
    "creator_wallet" TEXT NOT NULL,
    "max_members" INTEGER NOT NULL DEFAULT 20,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "squads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "squad_members" (
    "id" TEXT NOT NULL,
    "squad_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "role" "SquadRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "squad_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "squad_messages" (
    "id" TEXT NOT NULL,
    "squad_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "squad_messages_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "pools" ADD COLUMN "squad_id" TEXT,
ADD COLUMN "max_bettors" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "squads_invite_code_key" ON "squads"("invite_code");

-- CreateIndex
CREATE INDEX "squads_creator_wallet_idx" ON "squads"("creator_wallet");

-- CreateIndex
CREATE INDEX "squad_members_wallet_address_idx" ON "squad_members"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "squad_members_squad_id_wallet_address_key" ON "squad_members"("squad_id", "wallet_address");

-- CreateIndex
CREATE INDEX "squad_messages_squad_id_created_at_idx" ON "squad_messages"("squad_id", "created_at");

-- CreateIndex
CREATE INDEX "pools_squad_id_status_idx" ON "pools"("squad_id", "status");

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad_members" ADD CONSTRAINT "squad_members_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad_messages" ADD CONSTRAINT "squad_messages_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
