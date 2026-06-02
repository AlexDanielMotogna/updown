/**
 * Shared design tokens for the admin UI. Anything that varies by sport,
 * status, category, or layout role goes here so individual primitives can
 * stay dumb. Phase 2b will overlay the visual rules from the public app's
 * design language; the constants themselves don't change.
 *
 * Source of truth — do not duplicate these maps in individual tabs.
 * See PLAN-ADMIN-REFACTOR.md Phase 2.
 */
import { darkTokens as t } from '@/lib/theme';

// ─── Sport accent colors ────────────────────────────────────────────────
// Moved out of MatchExplorer.tsx so every list-style tab can stay aligned.
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

export function sportColor(sport: string | null | undefined): string {
  if (!sport) return t.text.tertiary;
  return SPORT_COLORS[sport.toUpperCase()] ?? t.text.tertiary;
}

// ─── Category type chips (admin CategoryManagement) ─────────────────────
export const CATEGORY_TYPE_COLORS: Record<string, string> = {
  FOOTBALL_LEAGUE: t.adminTypeColors.footballLeague,
  SPORTSDB_SPORT: t.adminTypeColors.sportsdbSport,
  POLYMARKET: t.adminTypeColors.polymarket,
};

// ─── Status palette (StatusChip single source) ──────────────────────────
// Every status string in the admin maps to one of these six semantic
// buckets. Individual components don't choose colors — they pick a status
// and let StatusChip render it.
export type StatusKind = 'ok' | 'pending' | 'warning' | 'error' | 'neutral' | 'info';

export const STATUS_PALETTE: Record<StatusKind, { fg: string; bg: string; label: string }> = {
  ok: { fg: t.gain, bg: t.gain, label: 'OK' },
  pending: { fg: t.text.tertiary, bg: t.text.tertiary, label: 'Pending' },
  warning: { fg: t.warning, bg: t.warning, label: 'Warning' },
  error: { fg: t.error, bg: t.error, label: 'Error' },
  neutral: { fg: t.text.secondary, bg: t.text.secondary, label: '—' },
  info: { fg: t.info, bg: t.info, label: 'Info' },
};

// ─── Layout tokens (MUI spacing units, 1 = 8px) ─────────────────────────
// One scale, no ad-hoc spacing in components. See PLAN-ADMIN-REFACTOR.md
// Phase 2b §4.
export const LAYOUT_TOKENS = {
  // Inline (within a single row of controls)
  inlineIconGap: 0.5,    // 4px  — icon next to label
  inlineButtonGap: 1,    // 8px  — adjacent buttons
  // Stacks (within a card)
  fieldStackGap: 1.5,    // 12px — form fields
  cardSectionGap: 2,     // 16px — sub-sections inside a card
  // Page-level
  cardToCardGap: 2,      // 16px — sibling cards
  pageSectionGap: 3,     // 24px — top-level page sections
  // Card padding
  cardPaddingDense: 2,   // 16px — single-purpose card
  cardPaddingDefault: 2.5, // 20px — multi-section card
  // Radius (matches the main app's scale)
  radiusChip: 1,         // 8px  — chips, pills
  radiusInput: 1.5,      // 12px — text fields
  radiusCard: 2,         // 16px — cards, dialog paper
} as const;

// ─── Polling cadence ─────────────────────────────────────────────────────
// Tier per page class. Currently each tab picks its own number; lock to
// these three so cadence reflects intent (real-time / dashboard / archive)
// rather than the author's whim.
export const POLL_FAST_MS = 15_000;   // health, live pool flow
export const POLL_MEDIUM_MS = 30_000; // users, financial overviews
export const POLL_SLOW_MS = 60_000;   // claim queues, log archives
export const POLL_NONE = false as const;
