import { prisma } from '../db';
import { emitPoolUpdate, emitBetPlaced } from '../websocket';
import { trackBetPlacement } from './rewards';

type Side = 'UP' | 'DOWN' | 'DRAW';

/**
 * Record a confirmed on-chain deposit: time-weight math, Bet upsert + pool
 * totals (atomic), DEPOSIT_CONFIRMED event, and the WebSocket pool/bet emits.
 * Shared by the user deposit route (after it verifies the tx on-chain) and the
 * liquidity bot (which knows the amount it just sent). The chain holds the
 * authoritative weight; this mirrors state.rs::multiplier_bps for analytics.
 */
export async function recordConfirmedBet(params: {
  pool: { id: string; startTime: Date; lockTime: Date };
  walletAddress: string;
  side: Side;
  betAmount: bigint;
  txSignature: string | null;
}): Promise<{ betId: string }> {
  const { pool, walletAddress, side, betAmount, txSignature } = params;

  const WEIGHT_FLOOR_BPS = 1_000n;
  const startSec = BigInt(Math.floor(pool.startTime.getTime() / 1000));
  const lockSec = BigInt(Math.floor(pool.lockTime.getTime() / 1000));
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const windowSec = lockSec - startSec;
  let multiplierBps = WEIGHT_FLOOR_BPS;
  if (windowSec > 0n) {
    const nowClamped = nowSec < startSec ? startSec : nowSec > lockSec ? lockSec : nowSec;
    const remaining = lockSec - nowClamped;
    const rawBps = (remaining * 10_000n) / windowSec;
    multiplierBps = rawBps > WEIGHT_FLOOR_BPS ? rawBps : WEIGHT_FLOOR_BPS;
  }
  const weightAdded = (betAmount * multiplierBps) / 10_000n;

  const [bet, updatedPool] = await prisma.$transaction(async (tx) => {
    const newBet = await tx.bet.upsert({
      where: { poolId_walletAddress_side: { poolId: pool.id, walletAddress, side } },
      create: {
        poolId: pool.id, walletAddress, side,
        amount: betAmount, weight: weightAdded,
        entryMultiplierBps: Number(multiplierBps), depositTx: txSignature,
      },
      update: {
        amount: { increment: betAmount },
        weight: { increment: weightAdded },
        depositTx: txSignature,
      },
    });

    const newPool = await tx.pool.update({
      where: { id: pool.id },
      data: {
        totalUp: side === 'UP' ? { increment: betAmount } : undefined,
        totalDown: side === 'DOWN' ? { increment: betAmount } : undefined,
        totalDraw: side === 'DRAW' ? { increment: betAmount } : undefined,
      },
    });

    await tx.eventLog.create({
      data: {
        eventType: 'DEPOSIT_CONFIRMED',
        entityType: 'bet',
        entityId: newBet.id,
        payload: { poolId: pool.id, walletAddress, side, amount: betAmount.toString(), txSignature },
      },
    });

    return [newBet, newPool] as const;
  });

  const weightRows = await prisma.bet.groupBy({ by: ['side'], where: { poolId: pool.id }, _sum: { weight: true } });
  const wsum = (s: Side) => (weightRows.find(r => r.side === s)?._sum.weight ?? 0n).toString();
  emitPoolUpdate(pool.id, {
    id: pool.id,
    totalUp: updatedPool.totalUp.toString(),
    totalDown: updatedPool.totalDown.toString(),
    totalDraw: updatedPool.totalDraw.toString(),
    weightedUp: wsum('UP'),
    weightedDown: wsum('DOWN'),
    weightedDraw: wsum('DRAW'),
  });
  emitBetPlaced(pool.id, { poolId: pool.id, side, amount: betAmount.toString(), at: Date.now() });

  trackBetPlacement(walletAddress, betAmount).catch(e => console.warn('[BetRecording] trackBetPlacement failed:', e instanceof Error ? e.message : e));

  return { betId: bet.id };
}
