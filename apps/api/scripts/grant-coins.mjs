import { PrismaClient } from '@prisma/client';

/**
 * DEV-ONLY helper: grant UP Coins to a wallet so you can test the sinks without
 * grinding bets. Amount is in DISPLAY UP (stored = *100).
 *
 * Usage (from apps/api):
 *   node scripts/grant-coins.mjs <walletAddress> [displayUP=5000]
 */
const prisma = new PrismaClient();

const wallet = process.argv[2];
const up = Number(process.argv[3] ?? 5000);
if (!wallet || !Number.isFinite(up) || up <= 0) {
  console.error('usage: node scripts/grant-coins.mjs <walletAddress> [displayUP]');
  process.exit(1);
}

const stored = BigInt(Math.round(up * 100));
const u = await prisma.user.upsert({
  where: { walletAddress: wallet },
  update: { coinsBalance: { increment: stored }, coinsLifetime: { increment: stored } },
  create: { walletAddress: wallet, coinsBalance: stored, coinsLifetime: stored },
});
console.log(`Granted ${up} UP to ${wallet}. New balance: ${(Number(u.coinsBalance) / 100).toLocaleString()} UP`);
await prisma.$disconnect();
