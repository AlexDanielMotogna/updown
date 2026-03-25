export { FootballAdapter } from './football-adapter';
export { BasketballAdapter } from './basketball-adapter';
export type { SportAdapter, Match, MatchResult, MatchStatus } from './types';

import { FootballAdapter } from './football-adapter';
import { BasketballAdapter } from './basketball-adapter';
import type { SportAdapter } from './types';

const adapters: Record<string, SportAdapter> = {
  FOOTBALL: new FootballAdapter(),
  BASKETBALL: new BasketballAdapter(),
};

export function getAdapter(sport: string): SportAdapter {
  const adapter = adapters[sport];
  if (!adapter) throw new Error(`No adapter for sport: ${sport}`);
  return adapter;
}

export function getSideLabels(sport: string | null | undefined): string[] {
  if (!sport) return ['Home', 'Draw', 'Away'];
  try {
    return getAdapter(sport).sideLabels;
  } catch {
    return ['Home', 'Draw', 'Away'];
  }
}

export function getAllAdapters(): SportAdapter[] {
  return Object.values(adapters);
}

export function listSports(): Array<{ sport: string; numSides: number; sideLabels: string[] }> {
  return Object.values(adapters).map(a => ({ sport: a.sport, numSides: a.numSides, sideLabels: a.sideLabels }));
}
