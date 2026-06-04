/**
 * Wipe ALL pools (+ bets, price snapshots, referral earnings) from the DB
 * pointed at by DATABASE_URL. Cutover prep for the time-weighted program
 * upgrade: old on-chain Pool/UserBet accounts use the pre-upgrade layout and
 * can no longer be deserialised, so the matching DB rows must go too.
 *
 * Unlike empty-pools.ts this has NO localhost guard — it prints the target
 * host loudly and wipes whatever DATABASE_URL points at. Set the URL via the
 * shell env (it overrides .env since dotenv does not override existing vars):
 *   $env:DATABASE_URL='...'; npx tsx scripts/wipe-all-pools.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  const host = url.replace(/^.*@/, '').replace(/[/?].*$/, '');
  console.log('TARGET HOST:', host || '(unset)');

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
  console.log('Done. On-chain pre-upgrade accounts remain orphaned (fine on test envs).');
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => prisma.$disconnect());
