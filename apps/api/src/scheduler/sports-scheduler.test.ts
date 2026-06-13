import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// voidSportsPool is the money-safety path for cancelled/postponed sports
// matches: refund every bettor their OWN stake, and ONLY THEN mark the pool
// CANCELLED. The invariant that protects funds is "never mark CANCELLED while a
// bettor is still owed" — if any refund fails with an unexpected error, the
// function must abort and retry next cycle. These tests pin that.
//
// Only the leaf dependencies voidSportsPool actually calls are mocked; the rest
// of sports-scheduler's import graph loads for real (it has no load-time side
// effects). Runs natively: pnpm --filter api exec vitest run <file>

// vi.mock is hoisted above imports, so the mock fns live in a vi.hoisted block
// the factories can legally reference.
const h = vi.hoisted(() => ({
  prisma: {
    bet: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    pool: { update: vi.fn() },
  },
  refundBettorOnChain: vi.fn(),
  sendAndConfirm: vi.fn(),
  emitPoolStatus: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock('../db', () => ({ prisma: h.prisma, default: h.prisma }));

// getAuthorityKeypair throws without AUTHORITY_SECRET_KEY; getConnection builds
// a real RPC manager. Stub both; keep the rest of utils/solana real.
vi.mock('../utils/solana', async (orig) => ({
  ...(await (orig() as Promise<object>)),
  getAuthorityKeypair: () => ({ publicKey: 'AUTH' }),
  getConnection: () => ({}),
  derivePoolSeed: () => Buffer.alloc(32),
}));

// PDA / instruction builders need real PublicKeys; stub to opaque values since
// sendAndConfirm (also stubbed) never inspects them.
vi.mock('solana-client', async (orig) => ({
  ...(await (orig() as Promise<object>)),
  getPoolPDA: () => ['poolPda'],
  getVaultPDA: () => ['vaultPda'],
  buildResolveWithWinnerIx: () => 'resolveIx',
  buildClosePoolIx: () => 'closeIx',
}));

vi.mock('./onchain-tx', async (orig) => ({
  ...(await (orig() as Promise<object>)),
  refundBettorOnChain: h.refundBettorOnChain,
}));

vi.mock('../utils/onchain', async (orig) => ({
  ...(await (orig() as Promise<object>)),
  sendAndConfirm: h.sendAndConfirm,
}));

vi.mock('../websocket', async (orig) => ({
  ...(await (orig() as Promise<object>)),
  emitPoolStatus: h.emitPoolStatus,
}));

vi.mock('./resolver-types', async (orig) => ({
  ...(await (orig() as Promise<object>)),
  logEvent: h.logEvent,
}));

import { voidSportsPool } from './sports-scheduler';

const pool = { id: 'pool-1', homeTeam: 'A', awayTeam: 'B' };
const bet = (id: string) => ({ id, walletAddress: `w-${id}`, side: 'UP', amount: 100n });

/** Drive an async fn that awaits real setTimeout delays to completion. */
async function runWithTimers(p: Promise<void>): Promise<void> {
  await vi.runAllTimersAsync();
  await p;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.sendAndConfirm.mockResolvedValue('txsig');
});
afterEach(() => vi.useRealTimers());

describe('voidSportsPool — abort safety', () => {
  it('does NOT mark the pool CANCELLED when a refund fails unexpectedly', async () => {
    h.prisma.bet.findMany.mockResolvedValue([bet('b1')]);
    h.refundBettorOnChain.mockRejectedValue(new Error('Blockhash not found'));

    await voidSportsPool(pool, 'CANCELLED');

    // The bettor is still owed → the pool must stay open for next cycle.
    expect(h.prisma.pool.update).not.toHaveBeenCalled();
    expect(h.emitPoolStatus).not.toHaveBeenCalled();
    expect(h.logEvent).not.toHaveBeenCalled();
    // And we did not falsely stamp the bet as refunded.
    expect(h.prisma.bet.update).not.toHaveBeenCalled();
    expect(h.prisma.bet.updateMany).not.toHaveBeenCalled();
  });

  it('aborts on the FIRST failure without refunding later bettors', async () => {
    h.prisma.bet.findMany.mockResolvedValue([bet('b1'), bet('b2')]);
    h.refundBettorOnChain.mockRejectedValueOnce(new Error('network timeout'));

    await voidSportsPool(pool, 'CANCELLED');

    expect(h.refundBettorOnChain).toHaveBeenCalledTimes(1); // stopped at b1
    expect(h.prisma.pool.update).not.toHaveBeenCalled();
  });
});

describe('voidSportsPool — happy path', () => {
  beforeEach(() => vi.useFakeTimers());

  it('refunds every bettor their principal, then marks the pool CANCELLED', async () => {
    h.prisma.bet.findMany.mockResolvedValue([bet('b1'), bet('b2')]);
    h.refundBettorOnChain.mockResolvedValue('refund-sig');

    await runWithTimers(voidSportsPool(pool, 'CANCELLED'));

    expect(h.refundBettorOnChain).toHaveBeenCalledTimes(2);
    // Each bet stamped claimed with its own stake as the payout.
    expect(h.prisma.bet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ claimed: true, payoutAmount: 100n, claimTx: 'refund-sig' }),
      }),
    );
    // Pool flipped to CANCELLED with a null winner.
    expect(h.prisma.pool.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pool-1' },
        data: expect.objectContaining({ status: 'CANCELLED', winner: null }),
      }),
    );
    expect(h.emitPoolStatus).toHaveBeenCalledWith('pool-1', expect.objectContaining({ status: 'CANCELLED' }));
    expect(h.logEvent).toHaveBeenCalledWith(expect.anything(), 'POOL_VOID_REFUNDED', 'pool', 'pool-1', expect.anything());
  });

  it('treats an already-refunded bet as settled and still cancels', async () => {
    h.prisma.bet.findMany.mockResolvedValue([bet('b1')]);
    h.refundBettorOnChain.mockRejectedValue(new Error('AlreadyClaimed'));

    await runWithTimers(voidSportsPool(pool, 'CANCELLED'));

    // Marked settled via updateMany (idempotent), pool still cancelled.
    expect(h.prisma.bet.updateMany).toHaveBeenCalled();
    expect(h.prisma.pool.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
  });
});
