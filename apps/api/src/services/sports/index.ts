export { FootballAdapter } from './football-adapter';
export { PolymarketAdapter } from './polymarket-adapter';
export { SportsDbAdapter, SPORTSDB_CONFIGS } from './api-sports-adapter';
export type { SportAdapter, Match, MatchResult, MatchStatus } from './types';

import { PolymarketAdapter } from './polymarket-adapter';
import { SportsDbAdapter, SPORTSDB_CONFIGS } from './api-sports-adapter';
import type { SportsDbConfig } from './api-sports-adapter';
import type { SportAdapter } from './types';
import { getSportsDbConfigs, getFootballConfigs } from '../category-config';

// Static adapters (always available)
const staticAdapters: Record<string, SportAdapter> = {
  POLYMARKET: new PolymarketAdapter(),
};

// Dynamic adapters cache (created from DB config)
const dynamicAdapters: Record<string, SportAdapter> = {};
let dynamicInitialized = false;

// Default football adapter (used when no league-specific adapter exists)
const DEFAULT_FOOTBALL_CONFIG: SportsDbConfig = {
  sport: 'FOOTBALL',
  sportQuery: 'Soccer',
  numSides: 3,
  sideLabels: ['Home', 'Draw', 'Away'],
};

// Initialize dynamic adapters from hardcoded fallback on first use
function initFallback(): void {
  if (dynamicInitialized) return;
  for (const c of SPORTSDB_CONFIGS) {
    dynamicAdapters[c.sport] = new SportsDbAdapter(c);
  }
  // Register a generic FOOTBALL adapter as fallback
  if (!dynamicAdapters['FOOTBALL']) {
    dynamicAdapters['FOOTBALL'] = new SportsDbAdapter(DEFAULT_FOOTBALL_CONFIG);
  }
  dynamicInitialized = true;
}

// Refresh dynamic adapters from DB config
async function refreshDynamic(): Promise<void> {
  try {
    // Load TheSportsDB sports (NBA, NHL, etc.)
    const sportsConfigs = await getSportsDbConfigs();
    for (const c of sportsConfigs) {
      dynamicAdapters[c.sport] = new SportsDbAdapter(c);
    }

    // Load football leagues (CL, PL, EL, etc.) — all via TheSportsDB
    const footballConfigs = await getFootballConfigs();
    for (const c of footballConfigs) {
      dynamicAdapters[c.sport] = new SportsDbAdapter(c);
    }

    // Ensure a generic FOOTBALL adapter exists
    if (!dynamicAdapters['FOOTBALL']) {
      dynamicAdapters['FOOTBALL'] = new SportsDbAdapter(DEFAULT_FOOTBALL_CONFIG);
    }

    dynamicInitialized = true;
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
  // For unknown football leagues, fall back to generic FOOTBALL adapter
  if (dynamicAdapters['FOOTBALL']) return dynamicAdapters['FOOTBALL'];
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
refreshDynamic().catch(e => { console.warn('[Adapters] dynamic refresh failed, using fallback:', e instanceof Error ? e.message : e); initFallback(); });
