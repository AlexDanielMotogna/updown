/**
 * Backfill Bet.payoutAmount with the ACTUAL on-chain claim transfer for
 * already-claimed bets. Auto-claim used to store a plain-parimutuel recompute
 * that disagreed with the time-weighted amount the chain actually paid; this
 * reads the real credit off each claim tx and corrects the row.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/backfill-claim-payouts.ts [poolDbId]
 * Omit poolDbId to scan every claimed bet that has a claimTx.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { getConnection, getUsdcMint } from '../src/utils/solana';
import { readOnchainClaimPayout } from '../src/utils/claim-payout';

const prisma = new PrismaClient();

async function main() {
  const poolId = process.argv[2];
  const bets = await prisma.bet.findMany({
    where: { claimed: true, claimTx: { not: null }, ...(poolId ? { poolId } : {}) },
    select: { id: true, walletAddress: true, claimTx: true, payoutAmount: true },
  });
  console.log(`Scanning ${bets.length} claimed bet(s)${poolId ? ` in pool ${poolId}` : ''}…`);

  const conn = getConnection();
  const mint = getUsdcMint();
  let fixed = 0, unchanged = 0, unreadable = 0;
  for (const b of bets) {
    const real = await readOnchainClaimPayout(conn, b.claimTx!, b.walletAddress, mint);
    if (real == null) { unreadable++; console.log(`  ? ${b.id} — tx unreadable, skipped`); continue; }
    if (b.payoutAmount != null && b.payoutAmount === real) { unchanged++; continue; }
    await prisma.bet.update({ where: { id: b.id }, data: { payoutAmount: real } });
    fixed++;
    console.log(`  ✓ ${b.walletAddress.slice(0, 6)} ${b.payoutAmount?.toString() ?? 'null'} → ${real.toString()} (${(Number(real) / 1e6).toFixed(2)} USDC)`);
  }
  console.log(`\nDone. fixed=${fixed} unchanged=${unchanged} unreadable=${unreadable}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
