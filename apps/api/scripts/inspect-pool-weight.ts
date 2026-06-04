/** Inspect a pool's timing + per-bet weight/multiplier. Usage:
 *   $env:DATABASE_URL='...'; npx tsx scripts/inspect-pool-weight.ts <poolDbId> */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env') });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const id = process.argv[2];
  const host = (process.env.DATABASE_URL || '').replace(/^.*@/, '').replace(/[/?].*$/, '');
  console.log('HOST:', host, '\nPOOL:', id);
  let pool = await prisma.pool.findUnique({ where: { id } }).catch(() => null);
  if (!pool) pool = await prisma.pool.findUnique({ where: { poolId: id } }).catch(() => null);
  if (!pool) { console.log('NOT FOUND'); return; }

  const st = pool.startTime ? Math.floor(pool.startTime.getTime() / 1000) : null;
  const lk = pool.lockTime ? Math.floor(pool.lockTime.getTime() / 1000) : null;
  const et = pool.endTime ? Math.floor(pool.endTime.getTime() / 1000) : null;
  console.log(JSON.stringify({
    status: pool.status, poolType: pool.poolType, winner: pool.winner,
    asset: pool.asset, numSides: pool.numSides,
    startTime: pool.startTime, lockTime: pool.lockTime, endTime: pool.endTime,
    windowSec_lockMinusStart: st != null && lk != null ? lk - st : null,
    totalUp: pool.totalUp?.toString?.() ?? pool.totalUp,
    totalDown: pool.totalDown?.toString?.() ?? pool.totalDown,
    totalDraw: pool.totalDraw?.toString?.() ?? pool.totalDraw,
  }, null, 2));

  const bets = await prisma.bet.findMany({ where: { poolId: pool.id }, orderBy: { createdAt: 'asc' } });
  console.log(`\nBETS (${bets.length}):`);
  for (const b of bets) {
    const tsec = Math.floor(b.createdAt.getTime() / 1000);
    const relToStart = st != null ? tsec - st : null;
    const relToLock = lk != null ? lk - tsec : null;
    console.log(JSON.stringify({
      wallet: b.walletAddress?.slice(0, 6), side: b.side,
      amount: b.amount?.toString?.() ?? b.amount,
      weight: b.weight?.toString?.() ?? b.weight,
      entry_multiplier_bps: b.entryMultiplierBps,
      claimed: b.claimed, payout: (b as any).payout?.toString?.() ?? (b as any).payout,
      createdAt: b.createdAt,
      secAfterStart: relToStart, secBeforeLock: relToLock,
    }));
  }
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
