import { prisma } from '../db';
import type { SportsDbConfig } from './sports/api-sports-adapter';

export interface PoolCategoryConfig {
  code: string;
  type: string;
  enabled: boolean;
  comingSoon: boolean;
  label: string;
  shortLabel: string | null;
  color: string | null;
  badgeUrl: string | null;
  iconKey: string | null;
  apiSource: string | null;
  adapterKey: string | null;
  numSides: number;
  sideLabels: string[];
  config: Record<string, unknown> | null;
  sortOrder: number;
}

// ── Hardcoded fallback (identical to current values) ────────────────────────

const FALLBACK: PoolCategoryConfig[] = [
  { code: 'CL', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false, label: 'Champions League', shortLabel: 'UCL', color: null, badgeUrl: 'https://crests.football-data.org/CL.png', iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL', numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], config: null, sortOrder: 0 },
  { code: 'PL', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false, label: 'Premier League', shortLabel: 'Premier', color: null, badgeUrl: 'https://crests.football-data.org/PL.png', iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL', numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], config: null, sortOrder: 1 },
  { code: 'PD', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false, label: 'La Liga', shortLabel: 'La Liga', color: null, badgeUrl: 'https://crests.football-data.org/PD.png', iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL', numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], config: null, sortOrder: 2 },
  { code: 'SA', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false, label: 'Serie A', shortLabel: 'Serie A', color: null, badgeUrl: 'https://crests.football-data.org/SA.png', iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL', numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], config: null, sortOrder: 3 },
  { code: 'BL1', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false, label: 'Bundesliga', shortLabel: 'Bundesliga', color: null, badgeUrl: 'https://crests.football-data.org/BL1.png', iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL', numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], config: null, sortOrder: 4 },
  { code: 'FL1', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false, label: 'Ligue 1', shortLabel: 'Ligue 1', color: null, badgeUrl: 'https://crests.football-data.org/FL1.png', iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL', numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], config: null, sortOrder: 5 },
  { code: 'BSA', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false, label: 'Brasileirao', shortLabel: 'Brasileirao', color: null, badgeUrl: 'https://crests.football-data.org/bsa.png', iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL', numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], config: null, sortOrder: 6 },
  { code: 'NBA', type: 'SPORTSDB_SPORT', enabled: true, comingSoon: false, label: 'NBA', shortLabel: 'NBA', color: '#F97316', badgeUrl: 'https://r2.thesportsdb.com/images/media/league/badge/frdjqy1536585083.png', iconKey: 'SportsBasketball', apiSource: 'thesportsdb', adapterKey: 'NBA', numSides: 2, sideLabels: ['Home', 'Away'], config: { sportQuery: 'Basketball', leagueFilter: 'NBA' }, sortOrder: 20 },
  { code: 'NHL', type: 'SPORTSDB_SPORT', enabled: true, comingSoon: false, label: 'NHL', shortLabel: 'NHL', color: '#3B82F6', badgeUrl: 'https://r2.thesportsdb.com/images/media/league/badge/4cem2k1619616539.png', iconKey: 'SportsHockey', apiSource: 'thesportsdb', adapterKey: 'NHL', numSides: 2, sideLabels: ['Home', 'Away'], config: { sportQuery: 'Ice Hockey', leagueFilter: 'NHL' }, sortOrder: 21 },
  { code: 'NFL', type: 'SPORTSDB_SPORT', enabled: true, comingSoon: false, label: 'NFL', shortLabel: 'NFL', color: '#22C55E', badgeUrl: 'https://r2.thesportsdb.com/images/media/league/badge/g85fqz1662057187.png', iconKey: 'SportsFootball', apiSource: 'thesportsdb', adapterKey: 'NFL', numSides: 2, sideLabels: ['Home', 'Away'], config: { sportQuery: 'American Football', leagueFilter: 'NFL' }, sortOrder: 22 },
  { code: 'MMA', type: 'SPORTSDB_SPORT', enabled: true, comingSoon: false, label: 'UFC', shortLabel: 'MMA', color: '#EF4444', badgeUrl: 'https://r2.thesportsdb.com/images/media/league/badge/bewnz31717531281.png', iconKey: 'SportsMma', apiSource: 'thesportsdb', adapterKey: 'MMA', numSides: 2, sideLabels: ['Fighter 1', 'Fighter 2'], config: { sportQuery: 'Fighting', leagueFilter: 'UFC' }, sortOrder: 23 },
  { code: 'PM_POLITICS', type: 'POLYMARKET', enabled: true, comingSoon: false, label: 'Politics', shortLabel: 'Politics', color: '#A78BFA', badgeUrl: null, iconKey: 'Gavel', apiSource: 'polymarket', adapterKey: 'POLYMARKET', numSides: 2, sideLabels: ['Yes', 'No'], config: { tags: ['Politics', 'Elections', 'Global Elections'], minVolume24h: 10000, maxDaysAhead: 1100 }, sortOrder: 40 },
  { code: 'PM_GEO', type: 'POLYMARKET', enabled: true, comingSoon: false, label: 'Geopolitics', shortLabel: 'Geo', color: '#60A5FA', badgeUrl: null, iconKey: 'Public', apiSource: 'polymarket', adapterKey: 'POLYMARKET', numSides: 2, sideLabels: ['Yes', 'No'], config: { tags: ['Geopolitics', 'Middle East'], minVolume24h: 10000, maxDaysAhead: 90 }, sortOrder: 41 },
  { code: 'PM_CULTURE', type: 'POLYMARKET', enabled: true, comingSoon: false, label: 'Culture & Entertainment', shortLabel: 'Culture', color: '#F472B6', badgeUrl: null, iconKey: 'TheaterComedy', apiSource: 'polymarket', adapterKey: 'POLYMARKET', numSides: 2, sideLabels: ['Yes', 'No'], config: { tags: ['Culture', 'Entertainment', 'Pop Culture'], minVolume24h: 5000, maxDaysAhead: 180 }, sortOrder: 42 },
  { code: 'PM_FINANCE', type: 'POLYMARKET', enabled: true, comingSoon: false, label: 'Finance & Economy', shortLabel: 'Finance', color: '#34D399', badgeUrl: null, iconKey: 'AccountBalance', apiSource: 'polymarket', adapterKey: 'POLYMARKET', numSides: 2, sideLabels: ['Yes', 'No'], config: { tags: ['Business', 'Commodities', 'Economics', 'Gold', 'Oil', 'Stocks'], minVolume24h: 10000, maxDaysAhead: 60 }, sortOrder: 43 },
];

// ── In-memory cache ─────────────────────────────────────────────────────────

let cachedCategories: PoolCategoryConfig[] = FALLBACK;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 60_000;

function mapRow(row: any): PoolCategoryConfig {
  return {
    code: row.code,
    type: row.type,
    enabled: row.enabled,
    comingSoon: row.comingSoon,
    label: row.label,
    shortLabel: row.shortLabel,
    color: row.color,
    badgeUrl: row.badgeUrl,
    iconKey: row.iconKey,
    apiSource: row.apiSource,
    adapterKey: row.adapterKey,
    numSides: row.numSides,
    sideLabels: row.sideLabels,
    config: row.config as Record<string, unknown> | null,
    sortOrder: row.sortOrder,
  };
}

async function refreshCache(): Promise<void> {
  if (Date.now() - lastFetchedAt < CACHE_TTL_MS) return;
  try {
    const rows = await prisma.poolCategory.findMany({ orderBy: { sortOrder: 'asc' } });
    if (rows.length > 0) {
      cachedCategories = rows.map(mapRow);
      lastFetchedAt = Date.now();
    }
  } catch (err) {
    console.warn('[CategoryConfig] DB read failed, using cached/fallback');
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getAllCategories(): Promise<PoolCategoryConfig[]> {
  await refreshCache();
  return cachedCategories;
}

export async function getEnabledCategories(type?: string): Promise<PoolCategoryConfig[]> {
  await refreshCache();
  const enabled = cachedCategories.filter(c => c.enabled);
  return type ? enabled.filter(c => c.type === type) : enabled;
}

export async function getVisibleCategories(): Promise<PoolCategoryConfig[]> {
  await refreshCache();
  return cachedCategories.filter(c => c.enabled || c.comingSoon);
}

export async function getFootballLeagueCodes(): Promise<string[]> {
  const cats = await getEnabledCategories('FOOTBALL_LEAGUE');
  return cats.map(c => c.code);
}

export async function getSportsDbConfigs(): Promise<SportsDbConfig[]> {
  const cats = await getEnabledCategories('SPORTSDB_SPORT');
  return cats.map(c => ({
    sport: c.code,
    sportQuery: (c.config as any)?.sportQuery || c.code,
    numSides: c.numSides,
    sideLabels: c.sideLabels,
    leagueFilter: (c.config as any)?.leagueFilter || c.code,
  }));
}

export interface PolymarketCategoryConfig {
  code: string;
  name: string;
  tags: string[];
  minVolume24h: number;
  maxDaysAhead: number;
}

export async function getPolymarketCategories(): Promise<PolymarketCategoryConfig[]> {
  const cats = await getEnabledCategories('POLYMARKET');
  return cats.map(c => ({
    code: c.code,
    name: c.label,
    tags: (c.config as any)?.tags || [],
    minVolume24h: (c.config as any)?.minVolume24h || 5000,
    maxDaysAhead: (c.config as any)?.maxDaysAhead || 90,
  }));
}

export function invalidateCache(): void {
  lastFetchedAt = 0;
}
