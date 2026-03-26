export { FootballAdapter } from './football-adapter';
export { BasketballAdapter } from './basketball-adapter';
export { PolymarketAdapter } from './polymarket-adapter';
export { SportsDbAdapter, SPORTSDB_CONFIGS } from './api-sports-adapter';
export type { SportAdapter, Match, MatchResult, MatchStatus } from './types';

import { FootballAdapter } from './football-adapter';
import { BasketballAdapter } from './basketball-adapter';
import { PolymarketAdapter } from './polymarket-adapter';
import { SportsDbAdapter, SPORTSDB_CONFIGS } from './api-sports-adapter';
import type { SportAdapter } from './types';
import { getSportsDbConfigs } from '../category-config';

// Static adapters (always available)
const staticAdapters: Record<string, SportAdapter> = {
  FOOTBALL: new FootballAdapter(),
  BASKETBALL: new BasketballAdapter(),
  POLYMARKET: new PolymarketAdapter(),
};

// Dynamic adapters cache (created from DB config)
const dynamicAdapters: Record<string, SportAdapter> = {};
let dynamicInitialized = false;

// Initialize dynamic adapters from hardcoded fallback on first use
function initFallback(): void {
  if (dynamicInitialized) return;
  for (const c of SPORTSDB_CONFIGS) {
    dynamicAdapters[c.sport] = new SportsDbAdapter(c);
  }
  dynamicInitialized = true;
}

// Refresh dynamic adapters from DB config
async function refreshDynamic(): Promise<void> {
  try {
    const configs = await getSportsDbConfigs();
    if (configs.length > 0) {
      for (const c of configs) {
        if (!dynamicAdapters[c.sport]) {
          dynamicAdapters[c.sport] = new SportsDbAdapter(c);
        }
      }
    }
  } catch {
    // Fall back to hardcoded
    initFallback();
  }
}

export function getAdapter(sport: string): SportAdapter {
  // Check static adapters first
  if (staticAdapters[sport]) return staticAdapters[sport];
  // Check dynamic adapters
  if (dynamicAdapters[sport]) return dynamicAdapters[sport];
  // Initialize from fallback if never done
  initFallback();
  if (dynamicAdapters[sport]) return dynamicAdapters[sport];
  throw new Error(`No adapter for sport: ${sport}`);
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
  initFallback();
  return [...Object.values(staticAdapters), ...Object.values(dynamicAdapters)];
}

export function listSports(): Array<{ sport: string; numSides: number; sideLabels: string[] }> {
  return getAllAdapters().map(a => ({ sport: a.sport, numSides: a.numSides, sideLabels: a.sideLabels }));
}

// Eagerly refresh on startup
refreshDynamic().catch(() => initFallback());
