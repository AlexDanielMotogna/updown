/**
 * Backfill User.totalWon = Σ payoutAmount over the wallet's claimed bets, so
 * the leaderboard Profit board (totalWon − totalWagered) has history. Going
 * forward each claim increments totalWon directly.
 *
 * Usage (from apps/api): $env:DATABASE_URL='...'; npx tsx scripts/backfill-total-won.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const host = (process.env.DATABASE_URL || '').replace(/^.*@/, '').replace(/[/?].*$/, '');
  console.log('HOST:', host);

  const rows = await prisma.bet.groupBy({
    by: ['walletAddress'],
    where: { claimed: true, payoutAmount: { not: null } },
    _sum: { payoutAmount: true },
  });
  console.log(`Wallets with claimed payouts: ${rows.length}`);

  let updated = 0;
  for (const r of rows) {
    const total = r._sum.payoutAmount ?? 0n;
    try {
      await prisma.user.update({ where: { walletAddress: r.walletAddress }, data: { totalWon: total } });
      updated++;
    } catch {
      // wallet may not have a user row — skip
    }
  }
  console.log(`Backfilled totalWon for ${updated} wallets.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
