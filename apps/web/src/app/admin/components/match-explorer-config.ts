import { darkTokens as t } from '@/lib/theme';

// Shared types + helpers for the MatchExplorer admin UI, extracted so the main
// component and the Browse/Add dialogs can share them without a cycle.

export type League = {
  code: string;
  label: string;
  type: 'FOOTBALL_LEAGUE' | 'SPORTSDB_SPORT';
  sport: string;
  enabled: boolean;
  comingSoon: boolean;
  externalLeagueId: string | null;
  sportQuery: string | null;
  leagueFilter: string | null;
  poolOpenDaysBefore: number | null;
  badgeUrl: string | null;
  badgeBgColor: string | null;
  poolCount: number;
  cachedMatchCount: number;
};

export type SdbLeague = {
  id: string;
  name: string;
  sport: string;
  alternate: string;
  inUse: boolean;
  categoryCode: string | null;
};

export type CachedMatch = {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest: string | null;
  awayTeamCrest: string | null;
  kickoff: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  leagueName: string | null;
  matchday: number | null;
  pool: { id: string; status: string } | null;
};

export const SPORT_COLORS: Record<string, string> = {
  FOOTBALL: t.up,
  NBA: '#FB923C',
  NHL: '#60A5FA',
  NFL: '#A78BFA',
  MMA: '#F87171',
  MLB: '#34D399',
  F1: '#EF4444',
  TENNIS: '#FBBF24',
  RUGBY: '#22D3EE',
  CRICKET: '#A3E635',
  ESPORTS: '#F472B6',
  BOXING: '#FCA5A5',
  GOLF: '#86EFAC',
};

export function statusChip(status: string) {
  const s = (status || '').toUpperCase();
  if (s === 'FINISHED' || s === 'FT') return { label: 'FT', color: t.text.tertiary };
  if (s === 'LIVE') return { label: 'LIVE', color: t.gain };
  if (s === 'SCHEDULED' || s === 'NS') return { label: 'Scheduled', color: t.text.tertiary };
  if (s === 'POSTPONED' || s === 'CANCELLED') return { label: s, color: t.error };
  return { label: status, color: t.text.tertiary };
}

export function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  const direction = diff >= 0 ? 'in ' : '';
  const suffix = diff >= 0 ? '' : ' ago';
  if (days > 0) return `${direction}${days}d ${hours}h${suffix}`;
  if (hours > 0) return `${direction}${hours}h ${mins}m${suffix}`;
  return `${direction}${mins}m${suffix}`;
}
