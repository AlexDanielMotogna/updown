import { prisma } from '../db';
import { getPoolPDA, getVaultPDA, buildResolveWithWinnerIx, buildClosePoolIx } from 'solana-client';
import { derivePoolSeed, getConnection, getAuthorityKeypair } from '../utils/solana';
import { refundBettorOnChain } from './onchain-tx';
import { sendAndConfirm } from '../utils/onchain';
import { logEvent, type OnChainDeps } from './resolver-types';
import { emitPoolStatus } from '../websocket';
import { TX_DELAY_MS } from './sports-shared';

/**
 * Void a sports pool whose match was cancelled / postponed / abandoned: refund
 * every bettor their OWN stake (via refund_bettor — fair for multi-side pools),
 * then mark the pool CANCELLED and best-effort reclaim its rent on-chain.
 * Aborts (and retries next cycle) if any refund can't land, so we never mark a
 * pool CANCELLED with bettors still unpaid.
 */
export async function voidSportsPool(
  pool: { id: string; homeTeam: string | null; awayTeam: string | null },
  reason: string,
): Promise<void> {
  const bets = await prisma.bet.findMany({
    where: { poolId: pool.id, claimed: false },
    select: { id: true, walletAddress: true, side: true, amount: true },
  });

  const wallet = getAuthorityKeypair();
  const connection = getConnection();
  // refund_bettor needs no price feed, so OnChainDeps (no PacificaProvider).
  const deps: OnChainDeps = { prisma, connection, wallet };

  // 1) Refund each bettor their principal.
  for (const bet of bets) {
    try {
      const sig = await refundBettorOnChain(deps, pool.id, bet.walletAddress, bet.side);
      await prisma.bet.update({ where: { id: bet.id }, data: { claimed: true, payoutAmount: bet.amount, claimTx: sig } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('AlreadyClaimed') || msg.includes('0xbc4') || msg.includes('AccountNotInitialized')) {
        // Already refunded / closed — treat as settled and continue.
        await prisma.bet.updateMany({ where: { id: bet.id, claimed: false }, data: { claimed: true } });
      } else {
        console.warn(`[Sports] void refund failed for bet ${bet.id} (${pool.id}) — will retry:`, msg);
        return; // don't mark CANCELLED while a bettor is still owed
      }
    }
    await new Promise(r => setTimeout(r, TX_DELAY_MS));
  }

  // 2) Best-effort rent reclaim: resolve (arbitrary) then close the now-empty
  //    pool. Non-fatal — orphan recovery can sweep the husk later.
  const seed = derivePoolSeed(pool.id);
  const [poolPda] = getPoolPDA(seed);
  const [vaultPda] = getVaultPDA(seed);
  try {
    await sendAndConfirm(buildResolveWithWinnerIx(poolPda, wallet.publicKey, 0), wallet, { label: 'resolve(void)' });
    await sendAndConfirm(buildClosePoolIx(poolPda, vaultPda, wallet.publicKey), wallet, { label: 'close_pool(void)' });
  } catch (e) {
    console.warn(`[Sports] void: rent reclaim deferred for ${pool.id}:`, e instanceof Error ? e.message : e);
  }

  // 3) Mark CANCELLED (null winner so the UI shows "cancelled", not a win/loss).
  await prisma.pool.update({ where: { id: pool.id }, data: { status: 'CANCELLED', winner: null, finalPrice: BigInt(0) } });
  emitPoolStatus(pool.id, { id: pool.id, status: 'CANCELLED' });
  await logEvent(prisma, 'POOL_VOID_REFUNDED', 'pool', pool.id, { reason, bets: bets.length.toString() });
  console.log(`[Sports] VOID + refunded ${bets.length} bet(s): ${pool.homeTeam} vs ${pool.awayTeam} (${reason})`);
}
