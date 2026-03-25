-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "on_chain_pda" TEXT;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "on_chain_vault" TEXT;
