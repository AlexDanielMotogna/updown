-- AlterTable: prize-claim fields for World Cup raffle winners (all nullable, no backfill)
ALTER TABLE "worldcup_winners" ADD COLUMN "payout_wallet" TEXT;
ALTER TABLE "worldcup_winners" ADD COLUMN "claimed_at" TIMESTAMP(3);
ALTER TABLE "worldcup_winners" ADD COLUMN "paid_tx" TEXT;
