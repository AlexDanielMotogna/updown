/**
 * Backfill referral codes for existing users.
 * Run with: npx tsx src/scripts/backfill-referral-codes.ts
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

function generateReferralCode(walletAddress: string): string {
  const salt = process.env.REFERRAL_SALT || 'updown-referrals-v1';
  return createHash('sha256')
    .update(walletAddress + salt)
    .digest('hex')
    .slice(0, 10);
}

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
