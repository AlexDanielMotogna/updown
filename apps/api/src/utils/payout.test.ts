import { describe, it, expect } from 'vitest';
import { calculatePayout, calculateWeightedPayout } from './payout';

// Off-chain payout projections. calculateWeightedPayout mirrors the on-chain
// claim formula (see programs/.../tests/money_math.rs::winnings_for); these
// pin the off-chain twins so UI/projection numbers can't silently drift from
// what the contract actually pays. Pure BigInt math, no I/O.

describe('calculatePayout (plain parimutuel)', () => {
  it('pays the proportional share of the whole pool', () => {
    // UP bet of 100 in a pool of 100 UP + 300 DOWN = 400; winnerPool = 100.
    // gross = 100 * 400 / 100 = 400.
    const r = calculatePayout({
      betAmount: 100n, totalUp: 100n, totalDown: 300n,
      side: 'UP', betCount: 2, feeBps: 500,
    });
    expect(r.grossPayout).toBe(400n);
    expect(r.fee).toBe(20n); // 5% of 400
    expect(r.payout).toBe(380n);
  });

  it('waives the fee when there is only one bettor (no counterparty)', () => {
    const r = calculatePayout({
      betAmount: 100n, totalUp: 100n, totalDown: 0n,
      side: 'UP', betCount: 1, feeBps: 500,
    });
    expect(r.fee).toBe(0n);
    expect(r.payout).toBe(r.grossPayout);
  });

  it('returns 0 when the winning side has no stake', () => {
    const r = calculatePayout({
      betAmount: 100n, totalUp: 0n, totalDown: 300n,
      side: 'UP', betCount: 2, feeBps: 500,
    });
    expect(r.grossPayout).toBe(0n);
    expect(r.payout).toBe(0n);
  });

  it('handles a 3-way (DRAW) pool', () => {
    const r = calculatePayout({
      betAmount: 50n, totalUp: 100n, totalDown: 100n, totalDraw: 50n,
      side: 'DRAW', betCount: 3, feeBps: 0,
    });
    // pool = 250, winnerPool(DRAW) = 50, gross = 50 * 250 / 50 = 250.
    expect(r.grossPayout).toBe(250n);
  });
});

describe('calculateWeightedPayout (mirror of on-chain claim)', () => {
  it('returns principal + weight-proportional share of the losing pool, minus fee', () => {
    // betWeight 200 of winningWeightSum 1000 over a 500 losing pool:
    // winnings = 200 * 500 / 1000 = 100; gross = 200 (stake) + 100 = 300.
    const r = calculateWeightedPayout({
      betAmount: 200n, betWeight: 200n, winningWeightSum: 1000n,
      losingStakeTotal: 500n, betCount: 2, feeBps: 500,
    });
    expect(r.grossPayout).toBe(300n);
    expect(r.fee).toBe(15n); // 5% of 300
    expect(r.payout).toBe(285n);
  });

  it('returns exactly the principal when there is no losing pool', () => {
    const r = calculateWeightedPayout({
      betAmount: 200n, betWeight: 200n, winningWeightSum: 1000n,
      losingStakeTotal: 0n, betCount: 1, feeBps: 500,
    });
    expect(r.grossPayout).toBe(200n);
    expect(r.payout).toBe(200n); // single bettor → no fee
  });

  it('never divides by zero when the winning weight sum is 0', () => {
    const r = calculateWeightedPayout({
      betAmount: 100n, betWeight: 0n, winningWeightSum: 0n,
      losingStakeTotal: 500n, betCount: 2, feeBps: 500,
    });
    expect(r.grossPayout).toBe(100n); // just the principal, no winnings
  });
});
