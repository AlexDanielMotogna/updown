import { describe, it, expect } from 'vitest';
import { Side } from '@prisma/client';
import { winnerForPrices, pricesForSideWin } from './resolve-logic';

// The crypto-pool winner rule and its inverse decide which side a price-based
// pool pays. A bug here pays the wrong side, so the rules are pinned here.
// Both functions are pure — no I/O.

describe('winnerForPrices', () => {
  it('UP wins when the final price is strictly above the strike', () => {
    expect(winnerForPrices(1000n, 1001n)).toBe(Side.UP);
    expect(winnerForPrices(0n, 1n)).toBe(Side.UP);
  });

  it('DOWN wins when the final price is below the strike', () => {
    expect(winnerForPrices(1000n, 999n)).toBe(Side.DOWN);
  });

  it('a tie (final == strike) goes to DOWN', () => {
    expect(winnerForPrices(1000n, 1000n)).toBe(Side.DOWN);
    expect(winnerForPrices(0n, 0n)).toBe(Side.DOWN);
  });
});

describe('pricesForSideWin', () => {
  it('returns prices where UP actually wins under the winner rule', () => {
    const { onChainStrike, onChainFinal } = pricesForSideWin(Side.UP);
    expect(onChainFinal > onChainStrike).toBe(true);
    expect(winnerForPrices(onChainStrike, onChainFinal)).toBe(Side.UP);
  });

  it('returns prices where DOWN actually wins (final <= strike)', () => {
    const { onChainStrike, onChainFinal } = pricesForSideWin(Side.DOWN);
    expect(onChainFinal <= onChainStrike).toBe(true);
    expect(winnerForPrices(onChainStrike, onChainFinal)).toBe(Side.DOWN);
  });

  it('is the inverse of winnerForPrices for both sides (round-trip)', () => {
    for (const side of [Side.UP, Side.DOWN] as const) {
      const { onChainStrike, onChainFinal } = pricesForSideWin(side);
      expect(winnerForPrices(onChainStrike, onChainFinal)).toBe(side);
    }
  });
});
