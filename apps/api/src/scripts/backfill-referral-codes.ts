/**
 * Backfill referral codes for existing users.
 * Run with: npx tsx src/scripts/backfill-referral-codes.ts
 */
import { PrismaClient } from '@prisma/client';
// Imported, not reimplemented. This file used to carry its own copy of the
// derivation, literal salt included, so fixing the service alone would have
// left the old salt live here and the two would have drifted apart the moment
// either changed.
import { generateReferralCode } from '../services/referrals';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { referralCode: null },
    select: { walletAddress: true },
  });

  console.log(`Found ${users.length} users without referral codes`);

  let updated = 0;
  for (const user of users) {
    const code = generateReferralCode(user.walletAddress);
    try {
      await prisma.user.update({
        where: { walletAddress: user.walletAddress },
        data: { referralCode: code },
      });
      updated++;
    } catch (err) {
      console.error(`Failed to update ${user.walletAddress}:`, err);
    }
  }

  console.log(`Updated ${updated}/${users.length} users`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
