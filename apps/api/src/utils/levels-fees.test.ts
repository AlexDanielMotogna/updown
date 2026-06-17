import { describe, it, expect } from 'vitest';
import { getFeeBps, DEFAULT_FEE_BPS } from './fees';
import {
  getXpForLevel, getXpToNextLevel, getLevelForXp,
  getLevelTitle, getLevelMultiplier, XP_ACTIONS,
} from './levels';

// Level → fee tier → payout, and the XP curve that drives the level. Pure math
// that feeds the money path (a wrong fee tier or level boundary mis-charges a
// winner). No I/O.

describe('getFeeBps — level fee tiers', () => {
  it('charges the right bps at each tier boundary', () => {
    expect(getFeeBps(0)).toBe(500);
    expect(getFeeBps(4)).toBe(500);
    expect(getFeeBps(5)).toBe(475);
    expect(getFeeBps(9)).toBe(475);
    expect(getFeeBps(10)).toBe(450);
    expect(getFeeBps(15)).toBe(425);
    expect(getFeeBps(20)).toBe(400);
    expect(getFeeBps(25)).toBe(375);
    expect(getFeeBps(30)).toBe(350);
    expect(getFeeBps(35)).toBe(325);
    expect(getFeeBps(39)).toBe(325);
    expect(getFeeBps(40)).toBe(300);
    expect(getFeeBps(100)).toBe(300); // capped past 40
  });

  it('never increases as level rises (monotonic non-increasing)', () => {
    for (let l = 1; l <= 50; l++) {
      expect(getFeeBps(l)).toBeLessThanOrEqual(getFeeBps(l - 1));
    }
  });

  it('default fee equals the lowest tier (anonymous users)', () => {
    expect(DEFAULT_FEE_BPS).toBe(getFeeBps(0));
    expect(DEFAULT_FEE_BPS).toBe(500);
  });
});

describe('levels — XP curve', () => {
  it('level 1 needs 0 XP; thresholds rise from there', () => {
    expect(getXpForLevel(1)).toBe(0n);
    expect(getXpForLevel(0)).toBe(0n);
    expect(getXpForLevel(2)).toBe(500n); // floor(500 * 1^1.8)
    expect(getXpForLevel(3)).toBeGreaterThan(getXpForLevel(2));
  });

  it('getXpForLevel is strictly increasing through level 40', () => {
    for (let l = 2; l <= 40; l++) {
      expect(getXpForLevel(l)).toBeGreaterThan(getXpForLevel(l - 1));
    }
  });

  it('caps at level 40 for any higher level', () => {
    expect(getXpForLevel(41)).toBe(getXpForLevel(40));
    expect(getXpForLevel(999)).toBe(getXpForLevel(40));
  });

  it('getLevelForXp is the inverse of getXpForLevel at every threshold', () => {
    for (let l = 1; l <= 40; l++) {
      expect(getLevelForXp(getXpForLevel(l))).toBe(l);
    }
  });

  it('one XP below a threshold stays on the lower level', () => {
    for (let l = 2; l <= 40; l++) {
      expect(getLevelForXp(getXpForLevel(l) - 1n)).toBe(l - 1);
    }
  });

  it('getXpToNextLevel is the gap to the next threshold, 0 at the cap', () => {
    expect(getXpToNextLevel(40)).toBe(0n);
    for (let l = 1; l < 40; l++) {
      expect(getXpToNextLevel(l)).toBe(getXpForLevel(l + 1) - getXpForLevel(l));
    }
  });
});

describe('levels — titles & multiplier bands', () => {
  it('title only upgrades at each milestone level', () => {
    expect(getLevelTitle(1)).toBe('Newcomer');
    expect(getLevelTitle(4)).toBe('Newcomer');
    expect(getLevelTitle(5)).toBe('Observer');
    expect(getLevelTitle(9)).toBe('Observer');
    expect(getLevelTitle(10)).toBe('Analyst');
    expect(getLevelTitle(40)).toBe('Apex Legend');
  });

  it('earning multiplier steps up only at milestone levels', () => {
    expect(getLevelMultiplier(9)).toBe(1.0);
    expect(getLevelMultiplier(10)).toBe(1.1);
    expect(getLevelMultiplier(15)).toBe(1.2);
    expect(getLevelMultiplier(20)).toBe(1.35);
    expect(getLevelMultiplier(25)).toBe(1.5);
    expect(getLevelMultiplier(30)).toBe(1.7);
    expect(getLevelMultiplier(35)).toBe(1.9);
    expect(getLevelMultiplier(40)).toBe(2.0);
  });
});

describe('XP_ACTIONS.winStreakBonus', () => {
  it('pays nothing below a 3-streak', () => {
    expect(XP_ACTIONS.winStreakBonus(0)).toBe(0n);
    expect(XP_ACTIONS.winStreakBonus(2)).toBe(0n);
  });

  it('pays 100 × (streak - 2), capped at streak 10 (800)', () => {
    expect(XP_ACTIONS.winStreakBonus(3)).toBe(100n);
    expect(XP_ACTIONS.winStreakBonus(5)).toBe(300n);
    expect(XP_ACTIONS.winStreakBonus(10)).toBe(800n);
    expect(XP_ACTIONS.winStreakBonus(50)).toBe(800n); // capped
  });
});
