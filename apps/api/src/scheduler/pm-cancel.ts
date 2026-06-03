import { Transaction } from '@solana/web3.js';
import { getPoolPDA, getVaultPDA, buildResolveWithWinnerIx, buildClosePoolIx, buildForceClosePoolIx } from 'solana-client';
import { prisma } from '../db';
import { derivePoolSeed, getConnection, getAuthorityKeypair } from '../utils/solana';
import { emitPoolStatus } from '../websocket';
import { polymarketFetch } from '../services/sports/polymarket-fetch';
import { readUmaQuestion } from '../services/polymarket/uma-resolver';
import { logEvent } from './resolver-types';
import { PoolStatus } from '@prisma/client';
import { forceRefundPool } from './admin-actions';

// PM pools whose kickoff (= market endDate) passed more than this many hours ago
// AND have 0 bets get auto-cancelled by the sweep. Two separate windows because
// the two failure modes look very different:
//
//   • Gamma-delisted: Polymarket pulled the market entirely. Decisive — once
//     the lookup returns empty there's no recovery path. Short window so dead
//     listings don't sit around (default 24h).
//
//   • UMA-stuck: the market is still on Gamma but UMA hasn't closed it. The
//     /match/[id] copy promises users "a few hours to 1-3 days for contested
//     questions", so we MUST wait longer than that before pulling the plug.
//     Default 120h (5d) = quoted upper bound (3d) + 2d safety buffer for
//     genuinely contested resolutions.
//
// Both still gated by betCount === 0 — pools with money stay for admin review.
const PM_SWEEP_GAMMA_DELISTED_GRACE_HOURS = Number(process.env.PM_SWEEP_GAMMA_DELISTED_GRACE_HOURS) || 24;
const PM_SWEEP_UMA_STUCK_GRACE_HOURS = Number(process.env.PM_SWEEP_UMA_STUCK_GRACE_HOURS) || 120;

/**
 * UMA-direct guard the sweep consults before pulling the trigger on a
 * cancellation. When POLYMARKET_USE_UMA is on, we don't cancel pools whose
 * underlying UMA question is still resolvable on Polygon — even if Gamma
 * has dropped the listing. This closes the second path (after
 * resolutionPoll's own guard) where editorial actions on Polymarket's
 * side could nuke a pool whose oracle is still live.
 *
 * Returns:
 *   • 'cancel'         — proceed with the existing cancel logic
 *   • 'skip-pending'   — UMA says the question is still resolvable; let
 *                        resolutionPoll catch it on the next cycle
 *   • 'skip-paused'    — UMA adapter paused (DVM dispute). Admin review.
 *   • 'skip-rpc-error' — transient Polygon RPC failure. Don't risk
 *                        user funds; the next sweep retries.
 *
 * When the flag is OFF or the cache row has no questionId, returns
 * 'cancel' so the legacy path is unchanged.
 */
type UmaSweepDecision = 'cancel' | 'skip-pending' | 'skip-paused' | 'skip-rpc-error';

async function consultUmaBeforeCancel(matchId: string | null): Promise<UmaSweepDecision> {
  if (process.env.POLYMARKET_USE_UMA !== 'true') return 'cancel';
  if (!matchId) return 'cancel';
  const cacheRow = await prisma.sportsFixtureCache.findFirst({
    where: { sport: 'POLYMARKET', externalId: matchId },
    select: { questionId: true },
  });
  const questionId = cacheRow?.questionId;
  if (!questionId) return 'cancel';
  const uma = await readUmaQuestion(questionId);
  if (uma.kind === 'resolved') return 'skip-pending'; // resolutionPoll will FINISH it
  if (uma.kind === 'paused') return 'skip-paused';
  if (uma.kind === 'pending') return 'skip-pending';
  if (uma.kind === 'rpc-error') return 'skip-rpc-error';
  // 'unknown' — adapter never knew about this questionID; proceed with cancel.
  return 'cancel';
}

/**
 * Check whether a Polymarket market is still queryable on Gamma. Returns true
 * when the market has been delisted (Gamma returns an empty array for the
 * lookup by id). Network errors are conservatively treated as "still exists"
 * so we don't cancel pools just because Gamma rate-limited us.
 */
export async function isMarketDelistedFromGamma(marketId: string): Promise<boolean> {
  try {
    const data = await polymarketFetch(`/markets?id=${marketId}`);
    if (Array.isArray(data)) return data.length === 0;
    return !data;
  } catch {
    return false;
  }
}

/**
 * Cancel a PM pool that can never resolve (delisted from Gamma, or stuck past
 * the UMA grace window). Flow:
 *   1. On-chain: resolve_with_winner(0) + close_pool to reclaim rent.
 *      (Pools with bets get force-refunded first via forceRefundPool, which
 *       runs the same on-chain resolve+refund path admin uses today.)
 *   2. DB: status=CANCELLED, winner=null.
 *
 * Idempotent: safe to call on already-cancelled pools (returns a noop).
 * Returns { status: 'cancelled' | 'refunded' | 'already-cancelled' | 'skipped' }.
 */
export async function cancelPmPool(
  poolId: string,
  reason: string,
): Promise<{ status: 'cancelled' | 'refunded' | 'already-cancelled' | 'skipped'; message?: string }> {
  const pool = await prisma.pool.findUnique({ where: { id: poolId } });
  if (!pool) return { status: 'skipped', message: 'pool not found' };
  if (pool.status === PoolStatus.CANCELLED) return { status: 'already-cancelled' };
  if (!pool.league?.startsWith('PM_')) {
    return { status: 'skipped', message: 'pool is not a Polymarket pool' };
  }

  const betCount = await prisma.bet.count({ where: { poolId } });

  // Pools with bets: refund users first (same path admin uses today for
  // force-refund). That call leaves the pool in CLAIMABLE; we then mark it
  // CANCELLED + null winner so the UI shows it as cancelled, not as a normal
  // win/loss with arbitrary winner.
  if (betCount > 0) {
    const connection = getConnection();
    const wallet = getAuthorityKeypair();
    const priceProvider = null as any; // unused on refund path
    await forceRefundPool({ prisma, connection, wallet, priceProvider }, poolId);
    await prisma.pool.update({
      where: { id: poolId },
      data: { status: PoolStatus.CANCELLED, winner: null, finalPrice: BigInt(0) },
    });
    await logEvent(prisma, 'POOL_PM_CANCELLED', 'pool', poolId, {
      reason, betCount: betCount.toString(), refunded: 'true',
    });
    emitPoolStatus(poolId, { id: poolId, status: 'CANCELLED' });
    console.log(`[PM-Cancel] Cancelled ${poolId} after refunding ${betCount} bet(s) - ${reason}`);
    return { status: 'refunded', message: `${betCount} bet(s) refunded` };
  }

  // 0-bet pools: resolve on-chain with arbitrary winner (0/UP) to flip status,
  // then close to reclaim rent. Mirrors the empty-pool path in resolveMatchPools.
  const connection = getConnection();
  const wallet = getAuthorityKeypair();
  const seed = derivePoolSeed(poolId);
  const [poolPda] = getPoolPDA(seed);
  const [vaultPda] = getVaultPDA(seed);

  // 1) Resolve on-chain. Skipped (but not aborted) when:
  //   - InvalidPoolStatus (0x177a): pool already resolved
  //   - AccountNotInitialized: pool already closed
  //   - AccountDidNotSerialize (0xbbc): on-chain account uses an older struct
  //     layout incompatible with the current IDL. We fall through to
  //     force_close which doesn't serialize state.
  let resolveOk = false;
  let needsForceClose = false;
  try {
    const ix = buildResolveWithWinnerIx(poolPda, wallet.publicKey, 0);
    const tx = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet);
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false, preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    resolveOk = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('InvalidPoolStatus') || msg.includes('0x177a') || msg.includes('AccountNotInitialized')) {
      // Already resolved or already closed — fine, proceed to close.
      resolveOk = true;
    } else if (msg.includes('AccountDidNotSerialize') || msg.includes('0xbbc')) {
      // Stale struct layout: go directly to force_close.
      console.warn(`[PM-Cancel] ${poolId} - account has stale layout, going to force_close`);
      needsForceClose = true;
    } else {
      console.warn(`[PM-Cancel] On-chain resolve failed for ${poolId} - aborting:`, msg);
      return { status: 'skipped', message: `on-chain resolve failed: ${msg}` };
    }
  }

  // 2) Close on-chain. Strategy:
  //   - resolve worked → try close_pool (cleans vault + reclaims rent)
  //   - force_close path → skip close_pool entirely
  //   - either fallback → force_close, then accept "resolved-only" state
  const tryForceClose = async (): Promise<boolean> => {
    try {
      const ix = buildForceClosePoolIx(poolPda, wallet.publicKey);
      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      tx.sign(wallet);
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false, preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      return true;
    } catch {
      return false;
    }
  };

  if (needsForceClose) {
    await tryForceClose();
  } else if (resolveOk) {
    try {
      const ix = buildClosePoolIx(poolPda, vaultPda, wallet.publicKey);
      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      tx.sign(wallet);
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false, preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    } catch {
      // Fall back to force_close; if that fails the pool stays resolved on-chain
      // and orphan recovery can sweep the rent later.
      await tryForceClose();
    }
  }

  // 3) DB: mark CANCELLED + null winner. Keep the row (audit trail).
  await prisma.pool.update({
    where: { id: poolId },
    data: { status: PoolStatus.CANCELLED, winner: null, finalPrice: BigInt(0) },
  });
  await logEvent(prisma, 'POOL_PM_CANCELLED', 'pool', poolId, {
    reason, betCount: '0', refunded: 'false',
  });
  emitPoolStatus(poolId, { id: poolId, status: 'CANCELLED' });
  console.log(`[PM-Cancel] Cancelled ${poolId} (0 bets) - ${reason}`);
  return { status: 'cancelled' };
}

/**
 * Sweep stuck Polymarket pools: kickoff (=market endDate) is more than the
 * shorter of the two grace windows in the past AND the pool is still
 * JOINING/ACTIVE.
 *
 * For each candidate we then ping Gamma to classify the failure:
 *   • Gamma returns no row → delisted. Cancel as soon as grace
 *     (PM_SWEEP_GAMMA_DELISTED_GRACE_HOURS, default 24h) has elapsed.
 *   • Gamma still has the row but UMA hasn't resolved it → uma-stuck. Only
 *     cancel after the LONGER grace (PM_SWEEP_UMA_STUCK_GRACE_HOURS,
 *     default 120h = 5d) so we don't pre-empt a contested resolution that
 *     the user-facing copy promised could take 1-3 days.
 *
 * 0-bet pools get auto-cancelled (cleans up dead listings without admin
 * intervention). Pools with bets are LEFT for the admin to handle — refunds
 * touch user funds, so we never decide that automatically.
 *
 * Runs from sweepUnresolvedPools (every 15 min).
 */
export async function sweepStuckPmPools(): Promise<void> {
  // ── Phase 1 — pools whose cache row is already CANCELLED ─────────────
  // resolutionPoll in polymarket-sync.ts now marks the cache CANCELLED as
  // soon as Gamma returns an empty array for the market id. That's a
  // terminal state: waiting longer cannot recover the market, so we skip
  // the 24h grace and cancel immediately. This closes the window where a
  // 0-bet pool sat in JOINING for hours after its market was delisted
  // (the pool the operator surfaced today: matchId=1698908 had its
  // market endDate >25h ago but startTime was just 20h ago, so the old
  // sweep's grace filter excluded it).
  const cancelledCacheRows = await prisma.sportsFixtureCache.findMany({
    where: { sport: 'POLYMARKET', apiSource: 'predictions', status: 'CANCELLED' },
    select: { externalId: true },
  });
  const cancelledMatchIds = cancelledCacheRows.map(r => r.externalId);

  let cancelled = 0;
  let leftForAdmin = 0;
  let waitingForUma = 0;
  let immediateCancelled = 0;
  // UMA guard counters — surface how many cancellations the oracle-direct
  // check is blocking so the cutover decision has data. Each maps to a
  // specific UmaSweepDecision.
  let umaHeldPending = 0;
  let umaHeldPaused = 0;
  let umaRpcErrors = 0;

  if (cancelledMatchIds.length > 0) {
    const explicitlyDelisted = await prisma.pool.findMany({
      where: {
        poolType: 'SPORTS',
        status: { in: [PoolStatus.JOINING, PoolStatus.ACTIVE] },
        league: { startsWith: 'PM_' },
        matchId: { in: cancelledMatchIds },
      },
      select: { id: true, matchId: true },
    });
    for (const pool of explicitlyDelisted) {
      const betCount = await prisma.bet.count({ where: { poolId: pool.id } });
      if (betCount > 0) { leftForAdmin++; continue; }
      // Ask UMA before pulling the trigger. The cache row was marked
      // CANCELLED by resolutionPoll when Gamma returned [], but the
      // adapter on Polygon might still consider the question live —
      // e.g. an hourly PM_FINANCE that Polymarket rotated the listing
      // for. Skip cancellation in that case; the next resolutionPoll
      // will either FINISH it (UMA resolves) or keep retrying.
      const decision = await consultUmaBeforeCancel(pool.matchId);
      if (decision !== 'cancel') {
        if (decision === 'skip-pending') umaHeldPending++;
        else if (decision === 'skip-paused') umaHeldPaused++;
        else if (decision === 'skip-rpc-error') umaRpcErrors++;
        await logEvent(prisma, 'POOL_PM_UMA_GUARD_HELD', 'pool', pool.id, {
          phase: 'immediate',
          decision,
          matchId: pool.matchId ?? '',
        });
        continue;
      }
      try {
        const r = await cancelPmPool(pool.id, `gamma-delisted-immediate (matchId=${pool.matchId})`);
        if (r.status === 'cancelled' || r.status === 'already-cancelled') {
          immediateCancelled++;
        }
      } catch (err) {
        console.warn(`[PM-Cancel] Immediate sweep failed for ${pool.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // ── Phase 2 — pools past the grace window, decided via Gamma ──────────
  // Use the SHORTER grace as the first filter. Anything that hasn't crossed
  // 24h since market close can't possibly be ready to cancel; skip the DB +
  // Gamma round trips for it.
  const earliestCutoff = new Date(Date.now() - PM_SWEEP_GAMMA_DELISTED_GRACE_HOURS * 60 * 60 * 1000);
  const umaCutoff = new Date(Date.now() - PM_SWEEP_UMA_STUCK_GRACE_HOURS * 60 * 60 * 1000);
  const stuck = await prisma.pool.findMany({
    where: {
      poolType: 'SPORTS',
      status: { in: [PoolStatus.JOINING, PoolStatus.ACTIVE] },
      league: { startsWith: 'PM_' },
      startTime: { lte: earliestCutoff },
      // Skip the ones Phase 1 already handled (or queued for admin).
      matchId: cancelledMatchIds.length > 0 ? { notIn: cancelledMatchIds } : undefined,
    },
    select: { id: true, matchId: true, homeTeam: true, league: true, startTime: true },
  });

  for (const pool of stuck) {
    const betCount = await prisma.bet.count({ where: { poolId: pool.id } });
    if (betCount > 0) {
      leftForAdmin++;
      continue;
    }
    try {
      const delisted = pool.matchId ? await isMarketDelistedFromGamma(pool.matchId) : false;
      // Apply the right grace per bucket. Delisted pools already passed the
      // 24h filter above; uma-stuck ones need the bigger window.
      if (!delisted && pool.startTime > umaCutoff) {
        waitingForUma++;
        continue;
      }
      // Same UMA guard the immediate phase uses. Even at the longer
      // uma-stuck-120h window we'd rather wait another cycle than
      // cancel a pool whose oracle is still chewing on the question.
      const decision = await consultUmaBeforeCancel(pool.matchId);
      if (decision !== 'cancel') {
        if (decision === 'skip-pending') umaHeldPending++;
        else if (decision === 'skip-paused') umaHeldPaused++;
        else if (decision === 'skip-rpc-error') umaRpcErrors++;
        await logEvent(prisma, 'POOL_PM_UMA_GUARD_HELD', 'pool', pool.id, {
          phase: delisted ? 'gamma-delisted' : 'uma-stuck',
          decision,
          matchId: pool.matchId ?? '',
        });
        continue;
      }
      const reason = delisted
        ? `gamma-delisted (matchId=${pool.matchId})`
        : `uma-stuck-${PM_SWEEP_UMA_STUCK_GRACE_HOURS}h`;
      const result = await cancelPmPool(pool.id, reason);
      if (result.status === 'cancelled' || result.status === 'already-cancelled') {
        cancelled++;
      }
    } catch (err) {
      console.warn(`[PM-Cancel] Sweep failed for ${pool.id}:`, err instanceof Error ? err.message : err);
    }
  }

  const umaHeldTotal = umaHeldPending + umaHeldPaused + umaRpcErrors;
  if (cancelled > 0 || immediateCancelled > 0 || leftForAdmin > 0 || waitingForUma > 0 || umaHeldTotal > 0) {
    console.log(
      `[PM-Cancel] Sweep: immediate-cancelled=${immediateCancelled} cancelled=${cancelled} ` +
      `waiting-for-uma=${waitingForUma} left-for-admin=${leftForAdmin} ` +
      `uma-held=${umaHeldTotal} (pending=${umaHeldPending} paused=${umaHeldPaused} rpc-err=${umaRpcErrors})`,
    );
  }
}
