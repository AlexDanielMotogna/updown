import { darkTokens as dt } from '@/lib/theme';

// Shared types + constants for the CategoryManagement admin UI, extracted so the
// main component and the Card / EditDialog sub-components can share them without
// a cycle.

export interface Category {
  id: string;
  code: string;
  type: string;
  enabled: boolean;
  comingSoon: boolean;
  label: string;
  shortLabel: string | null;
  color: string | null;
  badgeUrl: string | null;
  badgeBgColor: string | null;
  iconKey: string | null;
  apiSource: string | null;
  adapterKey: string | null;
  numSides: number;
  sideLabels: string[];
  config: Record<string, unknown> | null;
  sortOrder: number;
  parentCode: string | null;
}

export const TYPE_LABELS: Record<string, string> = {
  FOOTBALL_LEAGUE: 'Football Leagues',
  SPORTSDB_SPORT: 'Sports (TheSportsDB)',
  POLYMARKET: 'Prediction Markets',
};

export const TYPE_COLORS: Record<string, string> = {
  FOOTBALL_LEAGUE: dt.adminTypeColors.footballLeague,
  SPORTSDB_SPORT: dt.adminTypeColors.sportsdbSport,
  POLYMARKET: dt.adminTypeColors.polymarket,
};
