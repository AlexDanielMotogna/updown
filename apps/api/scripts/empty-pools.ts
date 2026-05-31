/**
 * Empties ALL pools (+ bets, price snapshots, referral earnings) from the
 * LOCALHOST database. Prep for redeploying the on-chain program (the new
 * per-side UserBet layout breaks existing on-chain accounts).
 *
 * SAFETY: aborts unless DATABASE_URL points at localhost. Run:
 *   cd apps/api && npx tsx scripts/empty-pools.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  const masked = url.replace(/\/\/[^@]*@/, '//***@');
  console.log('DATABASE_URL:', masked);

  if (!/@localhost[:/]|@127\.0\.0\.1[:/]/.test(url)) {
    throw new Error('SAFETY ABORT: DATABASE_URL is not localhost. Refusing to wipe.');
  }

  const [pools, bets] = await Promise.all([prisma.pool.count(), prisma.bet.count()]);
  console.log(`Before: pools=${pools} bets=${bets}`);
  if (pools === 0 && bets === 0) {
    console.log('Nothing to empty.');
    return;
  }

  // FK-safe order: price_snapshots & bets reference pools (no cascade).
  const ps = await prisma.priceSnapshot.deleteMany({});
  const re = await prisma.referralEarning.deleteMany({});
  const b = await prisma.bet.deleteMany({});
  const p = await prisma.pool.deleteMany({});

  console.log(`Deleted: priceSnapshots=${ps.count} referralEarnings=${re.count} bets=${b.count} pools=${p.count}`);
  console.log('Localhost pools emptied. (On-chain devnet accounts remain - orphaned after redeploy, fine on test.)');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
