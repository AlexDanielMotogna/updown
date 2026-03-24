export { FootballAdapter } from './football-adapter';
export type { SportAdapter, Match, MatchResult, MatchStatus } from './types';

import { FootballAdapter } from './football-adapter';
import type { SportAdapter } from './types';

const adapters: Record<string, SportAdapter> = {
  FOOTBALL: new FootballAdapter(),
};

export function getAdapter(sport: string): SportAdapter {
  const adapter = adapters[sport];
  if (!adapter) throw new Error(`No adapter for sport: ${sport}`);
  return adapter;
}

export function getAllAdapters(): SportAdapter[] {
  return Object.values(adapters);
}
