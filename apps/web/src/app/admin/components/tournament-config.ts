import type { StatusKind } from '../ui';

// Shared types + static config for the tournament admin UI, extracted from
// TournamentManagement so the main component and TournamentRow can both import
// them without a circular dependency.

export interface Tournament {
  id: string;
  name: string;
  asset: string;
  entryFee: string;
  size: number;
  matchDuration: number;
  predictionWindow: number;
  status: string;
  currentRound: number;
  totalRounds: number;
  prizePool: string;
  winnerWallet: string | null;
  scheduledAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  tournamentType: string;
  sport: string | null;
  league: string | null;
  _count: { participants: number };
  fixturesByRound?: Record<number, Array<{ footballMatchId: string; homeTeam: string; awayTeam: string; fixtureIndex: number; status: string }>>;
}

export const SPORT_OPTIONS = [
  { value: 'FOOTBALL', label: 'Soccer' },
  { value: 'NBA', label: 'NBA' },
  { value: 'NHL', label: 'NHL' },
  { value: 'NFL', label: 'NFL' },
  { value: 'MMA', label: 'UFC / MMA' },
];

// Sports that ARE their own league (no sub-league selection needed)
export const SINGLE_LEAGUE_SPORTS = new Set(['NBA', 'NHL', 'NFL', 'MMA']);

export const FOOTBALL_LEAGUES = [
  { value: 'CL', label: 'Champions League' },
  { value: 'PL', label: 'Premier League' },
  { value: 'PD', label: 'La Liga' },
  { value: 'SA', label: 'Serie A' },
  { value: 'BL1', label: 'Bundesliga' },
  { value: 'FL1', label: 'Ligue 1' },
  { value: 'BSA', label: 'Brasileirao' },
];

export function getLeaguesForSport(sport: string) {
  if (sport === 'FOOTBALL') return FOOTBALL_LEAGUES;
  return [];
}

export function getEffectiveLeague(sport: string, league: string) {
  if (SINGLE_LEAGUE_SPORTS.has(sport)) return sport;
  return league;
}

// Map tournament status to StatusKind for <StatusChip>. Single source of
// truth - no per-row sx={{ bgcolor: STATUS_COLORS[...] }} anywhere.
export const STATUS_TO_KIND: Record<string, StatusKind> = {
  REGISTERING: 'ok',     // signups open
  ACTIVE: 'warning',     // in-progress
  COMPLETED: 'neutral',
  CANCELLED: 'error',
};

// Anchor program currently only supports power-of-two brackets up to 32.
// Tournament service validates server-side; we mirror here so the Select
// only ever offers compatible sizes.
export const VALID_SIZES = [8, 16, 32];

export const USDC_DIVISOR = 1_000_000;

export type ActionKey = 'start' | 'cancel' | 'delete' | 'reset-round';

export const ACTION_META: Record<ActionKey, { severity: 'warning' | 'destructive'; verb: string; consequences: (name: string, round?: number) => string }> = {
  start: {
    severity: 'warning',
    verb: 'Start',
    consequences: (name) => `"${name}" will move from REGISTERING to ACTIVE and registration will close. This cannot be undone.`,
  },
  cancel: {
    severity: 'destructive',
    verb: 'Cancel',
    consequences: (name) => `"${name}" will be cancelled. Entry fees will need to be refunded manually. This cannot be undone.`,
  },
  delete: {
    severity: 'destructive',
    verb: 'Delete',
    consequences: (name) => `"${name}" will be permanently removed along with all its fixtures, matches, and participants. This cannot be undone.`,
  },
  'reset-round': {
    severity: 'warning',
    verb: 'Reset round',
    consequences: (name, round) => `Round ${round} of "${name}" will be deleted and recreated. Players will have 5 minutes to re-predict. This cannot be undone.`,
  },
};
