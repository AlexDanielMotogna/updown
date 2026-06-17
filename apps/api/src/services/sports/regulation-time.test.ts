import { describe, it, expect } from 'vitest';
import { regulationWinner, wentBeyondRegulation } from './regulation-time';

// regulation-time decides WHO GETS PAID in a sports pool: it maps a final
// score (+ raw status) to HOME / AWAY / DRAW. A bug here settles the pool to
// the wrong side, so the rules are pinned here. Pure, no I/O — runs natively.

describe('wentBeyondRegulation', () => {
  it('is false for missing / empty status', () => {
    expect(wentBeyondRegulation(null)).toBe(false);
    expect(wentBeyondRegulation(undefined)).toBe(false);
    expect(wentBeyondRegulation('')).toBe(false);
  });

  it('recognizes every extra-time / penalties token the upstream APIs emit', () => {
    // TheSportsDB, football-data.org and The Odds API variants.
    const tokens = [
      'AET', 'AP', 'PEN',
      'After Extra Time', 'After Penalties',
      'Penalty Shootout', 'Penalties',
      'EXTRA_TIME', 'Extra Time', 'PENALTY_SHOOTOUT',
    ];
    for (const t of tokens) {
      expect(wentBeyondRegulation(t), `${t} should count as beyond regulation`).toBe(true);
    }
  });

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(wentBeyondRegulation('aet')).toBe(true);
    expect(wentBeyondRegulation('  After Extra Time  ')).toBe(true);
    expect(wentBeyondRegulation('pEnAlTiEs')).toBe(true);
  });

  it('is false for normal full-time / unknown statuses', () => {
    expect(wentBeyondRegulation('FT')).toBe(false);
    expect(wentBeyondRegulation('Match Finished')).toBe(false);
    expect(wentBeyondRegulation('90')).toBe(false);
    // Substring of a token must NOT match (set membership, not includes()).
    expect(wentBeyondRegulation('penalty kick in regulation')).toBe(false);
  });
});

describe('regulationWinner', () => {
  it('returns HOME when the home side scores more in regulation', () => {
    expect(regulationWinner(2, 1, 'FT')).toBe('HOME');
    expect(regulationWinner(1, 0, null)).toBe('HOME');
  });

  it('returns AWAY when the away side scores more in regulation', () => {
    expect(regulationWinner(0, 3, 'FT')).toBe('AWAY');
    expect(regulationWinner(1, 2, undefined)).toBe('AWAY');
  });

  it('returns DRAW on an equal score in regulation', () => {
    expect(regulationWinner(0, 0, 'FT')).toBe('DRAW');
    expect(regulationWinner(2, 2, 'Match Finished')).toBe('DRAW');
  });

  it('returns DRAW whenever the match went beyond regulation, IGNORING the post-ET/PEN score', () => {
    // The whole point: a 90-minute draw decided on penalties must settle the
    // "who wins?" pool as a DRAW, not as the shootout winner.
    expect(regulationWinner(3, 1, 'AET')).toBe('DRAW');
    expect(regulationWinner(1, 2, 'PEN')).toBe('DRAW');
    expect(regulationWinner(5, 4, 'After Penalties')).toBe('DRAW');
    expect(regulationWinner(0, 1, 'PENALTY_SHOOTOUT')).toBe('DRAW');
  });
});
