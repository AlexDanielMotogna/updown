import { PoolStatus, Side } from '@prisma/client';
import { emitPoolStatus } from '../websocket';
import { resetStreak, awardBetResolution } from '../services/rewards';
import { recordReferralCommissions } from '../services/referrals';
import { ResolverDeps, logEvent, handleRpcError } from './resolver-types';
import { notifyPoolResolved } from '../services/notifications';
import { resolvePoolOnChain, autoRefundBets } from './onchain-tx';
import { getDistinctBettorWallets } from '../utils/bets';

/**
 * Generate strike/final prices that make a given side win on-chain.
 * UP wins when finalPrice > strikePrice, DOWN wins when finalPrice <= strikePrice.
 */
export function pricesForSideWin(side: Side): { onChainStrike: bigint; onChainFinal: bigint } {
  if (side === Side.UP) {
    // UP wins: final > strike
    return { onChainStrike: BigInt(1000), onChainFinal: BigInt(2000) };
  }
  // DOWN wins: final <= strike (equal → DOWN wins)
  return { onChainStrike: BigInt(2000), onChainFinal: BigInt(1000) };
}

/**
 * Single bettor (or single wallet hedging across sides): the pool has only ONE
 * distinct wallet, so there is no real counterparty. Refund the entire stake.
 *
 * Per-side PDA migration means a hedger can have N bet rows on the same pool.
 * The cleanest payout path uses one synthetic resolve + one on-chain refund on
 * the largest-stake side - refund.rs's formula
 *     payout = (stake × totalPool) / sideTotal
 * pays the user the ENTIRE vault on that side (since the wallet owns every
 * side). The remaining bet rows are marked claimed=true with their original
 * amount as the refund - UI-accurate and operationally a no-op (their on-chain
 * UserBet PDAs stay until close_pool reclaims everything).
 */
export async function handleSingleBettorRefund(
  deps: ResolverDeps,
  poolId: string,
  strikePrice: bigint,
  finalPrice: bigint,
  betCount: number,
): Promise<void> {
  // Pull ALL unclaimed bets, largest stake first - the on-chain refund uses
  // the largest-stake bet so the math has the most liquidity on it.
  const bets = await deps.prisma.bet.findMany({
    where: { poolId, claimed: false },
    orderBy: { amount: 'desc' },
  });

  if (bets.length === 0) {
    await deps.prisma.pool.update({
      where: { id: poolId },
      data: { status: PoolStatus.CLAIMABLE, finalPrice },
    });
    return;
  }

  // Defensive: confirm the "single bettor" promise - every bet must come from
  // the same wallet. If not, the caller mis-classified and we abort rather
  // than refund money the user didn't deposit.
  const wallet = bets[0].walletAddress;
  if (!bets.every(b => b.walletAddress === wallet)) {
    console.warn(`[Scheduler] handleSingleBettorRefund: pool ${poolId} has multiple wallets, aborting`);
    await deps.prisma.pool.update({
      where: { id: poolId },
      data: { status: PoolStatus.CLAIMABLE, finalPrice },
    });
    return;
  }

  // pricesForSideWin only encodes UP/DOWN - for a single bettor on DRAW (3-way
  // pool), there is no synthetic price pair that makes DRAW win, so fall back
  // to UP. The on-chain refund still pays the FULL pool to the user via that
  // UP-side bet (if any), or via DOWN if they hedged that side.
  const refundBet = bets.find(b => b.side === Side.UP)
    ?? bets.find(b => b.side === Side.DOWN)
    ?? bets[0]; // last resort: DRAW only - will need different handling
  const refundSide = refundBet.side as Side;

  const winnerForSyntheticResolve: Side =
    refundSide === Side.UP ? Side.UP : Side.DOWN;
  const { onChainStrike, onChainFinal } = pricesForSideWin(winnerForSyntheticResolve);
  await resolvePoolOnChain(deps, poolId, onChainStrike, onChainFinal);

  await deps.prisma.pool.update({
    where: { id: poolId },
    data: { finalPrice, winner: winnerForSyntheticResolve },
  });

  // Refund just the chosen side on-chain - it receives the full pool.
  const refundSuccess = await autoRefundBets(deps, poolId, [refundBet]);

  if (refundSuccess && bets.length > 1) {
    // Mark the sibling-side bets as refunded too. Their stake came back via
    // the chosen-side refund on-chain transfer; surface that to the UI by
    // stamping each row with its own stake as payoutAmount.
    const siblings = bets.filter(b => b.id !== refundBet.id);
    await Promise.all(siblings.map(b =>
      deps.prisma.bet.update({
        where: { id: b.id },
        data: { claimed: true, payoutAmount: b.amount },
      }),
    ));
    await logEvent(deps.prisma, 'POOL_REFUND_SIBLINGS_MARKED', 'pool', poolId, {
      reason: 'hedged_single_bettor',
      siblingBets: siblings.length.toString(),
      walletAddress: wallet,
    });
  }

  await deps.prisma.pool.update({
    where: { id: poolId },
    data: { status: PoolStatus.CLAIMABLE },
  });

  await logEvent(deps.prisma, 'POOL_REFUND', 'pool', poolId, {
    reason: refundSuccess ? 'single_bettor_auto' : 'single_bettor_manual_fallback',
    strikePrice: strikePrice.toString(),
    finalPrice: finalPrice.toString(),
    betCount: betCount.toString(),
    totalBets: bets.length.toString(),
    walletAddress: wallet,
    onChainWinner: winnerForSyntheticResolve,
    refundSide,
  });

  console.log(
    refundSuccess
      ? `[Scheduler] Pool ${poolId} → auto-refunded (single wallet ${wallet}, ${bets.length} bet(s), winner=${winnerForSyntheticResolve})`
      : `[Scheduler] Pool ${poolId} → CLAIMABLE (single wallet, auto-refund failed, manual claim available)`,
  );

  emitPoolStatus(poolId, { id: poolId, status: 'CLAIMABLE' });
}

/**
 * One-sided pool: all bets on one side. Resolve on-chain with prices that make
 * the side-with-bets win, then auto-refund. Falls back to CLAIMABLE for manual claim.
 */
export async function handleOneSidedRefund(
  deps: ResolverDeps,
  poolId: string,
  winner: Side,
  strikePrice: bigint,
  finalPrice: bigint,
  betCount: number,
): Promise<void> {
  // The actual winner has 0 bets. We want the OTHER side (with bets) to win.
  const sideWithBets = winner === Side.UP ? Side.DOWN : Side.UP;

  // If only one wallet ever deposited, delegate to the hedger-aware path -
  // refund the whole stake regardless of how many sides they covered. This
  // is identical to handleSingleBettorRefund's contract.
  const distinctWallets = await getDistinctBettorWallets(poolId);
  if (distinctWallets.length === 1) {
    await handleSingleBettorRefund(deps, poolId, strikePrice, finalPrice, betCount);
    return;
  }

  const { onChainStrike, onChainFinal } = pricesForSideWin(sideWithBets);

  await resolvePoolOnChain(deps, poolId, onChainStrike, onChainFinal);

  await deps.prisma.pool.update({
    where: { id: poolId },
    data: { finalPrice, winner: sideWithBets },
  });

  // Get all bets to refund
  const bets = await deps.prisma.bet.findMany({
    where: { poolId, claimed: false },
  });

  // Auto-refund with 3 retries
  const refundSuccess = await autoRefundBets(deps, poolId, bets);

  if (refundSuccess) {
    await deps.prisma.pool.update({
      where: { id: poolId },
      data: { status: PoolStatus.CLAIMABLE },
    });
    await logEvent(deps.prisma, 'POOL_REFUND', 'pool', poolId, {
      reason: 'one_sided_auto',
      strikePrice: strikePrice.toString(),
      finalPrice: finalPrice.toString(),
      winner: sideWithBets,
      betCount: betCount.toString(),
    });
    console.log(`[Scheduler] Pool ${poolId} → auto-refunded (one-sided, winner=${sideWithBets})`);
  } else {
    await deps.prisma.pool.update({
      where: { id: poolId },
      data: { status: PoolStatus.CLAIMABLE },
    });
    await logEvent(deps.prisma, 'POOL_REFUND', 'pool', poolId, {
      reason: 'one_sided_manual_fallback',
      strikePrice: strikePrice.toString(),
      finalPrice: finalPrice.toString(),
      winner: sideWithBets,
      betCount: betCount.toString(),
    });
    console.log(`[Scheduler] Pool ${poolId} → CLAIMABLE (auto-refund failed, manual claim available)`);
  }

  emitPoolStatus(poolId, { id: poolId, status: 'CLAIMABLE' });
}

/**
 * Handle a stuck ACTIVE pool that has no strike price.
 * If no bets → move straight to CLAIMABLE for cleanup.
 * If bets exist → resolve on-chain with synthetic prices, then auto-refund.
 */
export async function handleNoStrikePricePool(
  deps: ResolverDeps,
  poolId: string,
): Promise<void> {
  try {
    const bets = await deps.prisma.bet.findMany({
      where: { poolId, claimed: false },
    });

    if (bets.length === 0) {
      await deps.prisma.pool.update({
        where: { id: poolId },
        data: { status: PoolStatus.CLAIMABLE },
      });
      await logEvent(deps.prisma, 'POOL_STUCK_CLEANUP', 'pool', poolId, {
        reason: 'no_strike_price_no_bets',
      });
      emitPoolStatus(poolId, { id: poolId, status: 'CLAIMABLE' });
      console.log(`[Scheduler] Pool ${poolId} → CLAIMABLE (no strike price, no bets)`);
      return;
    }

    console.log(`[Scheduler] Pool ${poolId}: no strike price, resolving on-chain for ${bets.length} bet(s)`);

    // If only one wallet ever deposited (possibly across multiple sides), the
    // pool is effectively single-bettor and must refund the whole stake. The
    // hedger-aware single-bettor handler does the right thing here.
    const distinctWallets = await getDistinctBettorWallets(poolId);
    if (distinctWallets.length === 1) {
      await handleSingleBettorRefund(deps, poolId, 0n, 0n, bets.length);
      return;
    }

    // Determine which side has bets and make that side win
    const hasUp = bets.some(b => b.side === Side.UP);
    const hasDown = bets.some(b => b.side === Side.DOWN);
    let refundWinner: Side;

    if (hasUp && !hasDown) {
      refundWinner = Side.UP;
    } else if (hasDown && !hasUp) {
      refundWinner = Side.DOWN;
    } else {
      // Both sides have bets - DOWN wins by default (equal prices)
      refundWinner = Side.DOWN;
    }

    const { onChainStrike, onChainFinal } = pricesForSideWin(refundWinner);

    await resolvePoolOnChain(deps, poolId, onChainStrike, onChainFinal);

    await deps.prisma.pool.update({
      where: { id: poolId },
      data: { status: PoolStatus.CLAIMABLE, winner: refundWinner },
    });

    // Auto-refund with 3 retries
    const refundSuccess = await autoRefundBets(deps, poolId, bets);

    await logEvent(deps.prisma, 'POOL_STUCK_CLEANUP', 'pool', poolId, {
      reason: 'no_strike_price_with_bets',
      refundedCount: bets.length.toString(),
      onChainWinner: refundWinner,
      autoRefund: refundSuccess ? 'success' : 'failed_manual_fallback',
    });
    emitPoolStatus(poolId, { id: poolId, status: 'CLAIMABLE' });
    console.log(`[Scheduler] Pool ${poolId} → CLAIMABLE (no strike price, ${bets.length} bet(s), winner=${refundWinner}, auto=${refundSuccess})`);
  } catch (error) {
    handleRpcError(error);
    console.error(`[Scheduler] Failed to clean up stuck pool ${poolId}:`, error);
  }
}

/**
 * Resolve a single pool: capture final price, determine winner.
 * Uses atomic status claim to prevent race conditions.
 */
export async function resolvePool(
  deps: ResolverDeps,
  pool: {
    id: string;
    poolId: string;
    asset: string;
    strikePrice: bigint | null;
    totalUp: bigint;
    totalDown: bigint;
  },
): Promise<void> {
  // Explicit null check - `!pool.strikePrice` is wrong because 0n is falsy in
  // JS yet a legitimate value for some pool types (sports pools have always
  // initialised strikePrice to 0n). Only treat actual nulls as "stuck".
  if (pool.strikePrice == null) {
    console.warn(`[Scheduler] Pool ${pool.id} has no strike price - cleaning up stuck pool`);
    await handleNoStrikePricePool(deps, pool.id);
    return;
  }

  // Atomic claim: only one scheduler tick can resolve this pool
  // Try JOINING first (new flow), fall back to ACTIVE (backward compat)
  let claimed = await deps.prisma.pool.updateMany({
    where: { id: pool.id, status: PoolStatus.JOINING },
    data: { status: PoolStatus.RESOLVED },
  });
  if (claimed.count === 0) {
    claimed = await deps.prisma.pool.updateMany({
      where: { id: pool.id, status: PoolStatus.ACTIVE },
      data: { status: PoolStatus.RESOLVED },
    });
  }
  if (claimed.count === 0) return;

  try {
    const [priceTick, betCount] = await Promise.all([
      deps.priceProvider.getSpotPrice(pool.asset),
      deps.prisma.bet.count({ where: { poolId: pool.id } }),
    ]);
    const finalPrice = priceTick.price;
    const strikePrice = pool.strikePrice;

    console.log(
      `[Scheduler] Pool ${pool.id} resolution: strike=${strikePrice} final=${finalPrice} diff=${finalPrice - strikePrice}`,
    );

    // Empty pool - no winner, but still resolve on-chain so close_pool works
    if (betCount === 0) {
      try {
        await resolvePoolOnChain(deps, pool.id, strikePrice, finalPrice);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Pool doesn't exist on-chain (never created or already closed) - just clean up DB
        if (msg.includes('AccountNotInitialized') || msg.includes('0xbc4')) {
          console.log(`[Scheduler] Pool ${pool.id} not found on-chain - deleting DB record`);
          await deps.prisma.pool.deleteMany({ where: { id: pool.id } }).catch(() => {});
          return;
        }
        throw err; // re-throw other errors
      }
      await deps.prisma.pool.updateMany({
        where: { id: pool.id },
        data: { status: PoolStatus.CLAIMABLE, finalPrice },
      });
      await logEvent(deps.prisma, 'POOL_RESOLVED', 'pool', pool.id, {
        reason: 'empty_pool',
        strikePrice: strikePrice.toString(),
        finalPrice: finalPrice.toString(),
      });
      console.log(`[Scheduler] Pool ${pool.id} → CLAIMABLE (empty, no bets)`);
      return;
    }

    // Store price snapshot (only for pools with bets)
    deps.prisma.priceSnapshot.create({
      data: {
        poolId: pool.id,
        type: 'FINAL',
        price: finalPrice,
        timestamp: priceTick.timestamp,
        source: priceTick.source,
        rawHash: priceTick.rawHash || '',
      },
    }).catch((err) => console.error(`[Scheduler] Failed to save price snapshot:`, err));

    // Single WALLET - not single bet. After the per-side PDA migration a
    // wallet can have N bet rows in a pool (hedger), so `betCount === 1`
    // misses the hedged single-bettor case and the user loses everything
    // they bet on the non-winning sides. Distinct wallets is the correct
    // notion of "is there a counterparty".
    const distinctWallets = await getDistinctBettorWallets(pool.id);
    if (distinctWallets.length === 1) {
      await handleSingleBettorRefund(deps, pool.id, strikePrice, finalPrice, betCount);
      return;
    }

    // Determine winner
    let winner: Side;
    if (finalPrice > strikePrice) {
      winner = Side.UP;
    } else if (finalPrice < strikePrice) {
      winner = Side.DOWN;
    } else {
      winner = Side.DOWN; // Tie goes to DOWN
    }

    // One-sided pool - resolve on-chain with prices that make the side-with-bets win, then auto-refund
    const winningSideTotal = winner === Side.UP ? pool.totalUp : pool.totalDown;
    if (winningSideTotal === BigInt(0)) {
      await handleOneSidedRefund(deps, pool.id, winner, strikePrice, finalPrice, betCount);
      return;
    }

    // Normal resolution - both sides have bets
    await resolvePoolOnChain(deps, pool.id, strikePrice, finalPrice);

    await deps.prisma.pool.update({
      where: { id: pool.id },
      data: { finalPrice, winner },
    });

    // Record referral commissions for ALL bets (win or lose) - fire-and-forget
    const allBets = await deps.prisma.bet.findMany({
      where: { poolId: pool.id },
      select: { id: true, walletAddress: true, amount: true },
    });
    recordReferralCommissions(pool.id, allBets).catch(e => console.warn('[Resolver] referral commissions failed:', e instanceof Error ? e.message : e));

    // Award participation XP to every bettor (winner OR loser). Only reached on a
    // normal two-sided resolution - refunded one-sided/single-bettor pools never
    // get here, so XP cannot be farmed via dust bets that get refunded.
    const xpWallets = [...new Set(allBets.map((b) => b.walletAddress))];
    await Promise.all(xpWallets.map((wallet) => awardBetResolution(wallet)));

    // Reset streak for losers
    const losingSide = winner === Side.UP ? Side.DOWN : Side.UP;
    const losingBets = await deps.prisma.bet.findMany({
      where: { poolId: pool.id, side: losingSide },
      select: { walletAddress: true },
    });
    const losingWallets = [...new Set(losingBets.map((b) => b.walletAddress))];
    await Promise.all(losingWallets.map((wallet) => resetStreak(wallet)));

    await logEvent(deps.prisma, 'POOL_RESOLVED', 'pool', pool.id, {
      strikePrice: strikePrice.toString(),
      finalPrice: finalPrice.toString(),
      winner,
      totalUp: pool.totalUp.toString(),
      totalDown: pool.totalDown.toString(),
    });

    emitPoolStatus(pool.id, {
      id: pool.id,
      status: 'RESOLVED',
      strikePrice: strikePrice.toString(),
      finalPrice: finalPrice.toString(),
      winner,
    });

    // Persist notifications for all bettors
    notifyPoolResolved({ id: pool.id, asset: pool.asset, poolType: 'CRYPTO', winner }).catch(() => {});

    console.log(`[Scheduler] Pool ${pool.id} → RESOLVED: winner=${winner}, strike=${strikePrice}, final=${finalPrice}`);
  } catch (error) {
    handleRpcError(error);
    console.error(`[Scheduler] Failed to resolve pool ${pool.id}, reverting to JOINING:`, error);
    await deps.prisma.pool.update({
      where: { id: pool.id },
      data: { status: PoolStatus.JOINING },
    }).catch(e => console.warn('[Resolver] rollback failed:', e instanceof Error ? e.message : e));
  }
}
