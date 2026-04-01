// ─── Design tokens ───────────────────────────────────────────────────────────
import { darkTokens } from '@/lib/theme';

export const BG = darkTokens.bg.app;
export const SURFACE = darkTokens.bg.surface;
export const BORDER = darkTokens.border.default;
export const MATCH_W = 280;
export const CARD_H = 124;
export const CARD_GAP = 32;
export const PREDICT_COLOR = darkTokens.predict;

// Header = label (20px) + gap (16px) + optional fixtures info
const LABEL_H = 20;
const LABEL_GAP = 16;
const FIXTURE_ROW_H = 18; // each fixture row ~18px
const FIXTURE_GAP = 12;   // gap after fixtures block

export function getHeaderHeight(fixtureCount: number): number {
  const base = LABEL_H + LABEL_GAP;
  if (fixtureCount <= 0) return base;
  return base + fixtureCount * FIXTURE_ROW_H + FIXTURE_GAP;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function truncate(w: string | null) {
  return w ? `${w.slice(0, 4)}...${w.slice(-4)}` : 'TBD';
}

export function getRoundLabel(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return 'Final';
  if (fromFinal === 1) return 'Semifinals';
  if (fromFinal === 2) return 'Quarterfinals';
  return `Round of ${Math.pow(2, fromFinal + 1)}`;
}

export function formatPrice(price: string | null | undefined): string {
  if (!price) return '—';
  const n = Number(price) / 1_000_000;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDistance(prediction: string, finalPrice: string): string {
  const diff = (Number(prediction) - Number(finalPrice)) / 1_000_000;
  const abs = Math.abs(diff);
  const prefix = diff >= 0 ? '+' : '-';
  return `${prefix}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Sports helpers ─────────────────────────────────────────────────────────

export interface MatchdayPrediction {
  outcomes: string[];
  totalGoals: number;
}

export function parseMatchdayPrediction(raw: string | null): MatchdayPrediction | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return { outcomes: p.outcomes || [], totalGoals: p.totalGoals ?? 0 };
  } catch {
    return null;
  }
}

export function formatOutcome(outcome: string | null | undefined, sideLabels?: string[]): string {
  if (!outcome) return '—';
  // Dynamic: map key back to display label
  if (sideLabels) {
    const idx = sideLabels.findIndex(l => l.toUpperCase() === outcome);
    if (idx >= 0) return sideLabels[idx];
  }
  // Default fallback
  if (outcome === 'HOME') return 'Home';
  if (outcome === 'DRAW') return 'Draw';
  if (outcome === 'AWAY') return 'Away';
  // Legacy single-value format
  const n = Number(outcome);
  if (n === 1) return 'Home';
  if (n === 2) return 'Draw';
  if (n === 3) return 'Away';
  return '—';
}

/** Format kickoff time for display */
export function formatKickoff(kickoff: string | null | undefined): string {
  if (!kickoff) return '';
  const d = new Date(kickoff);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

/** Default sideLabels for 3-way sports (football) */
export const DEFAULT_SIDE_LABELS = ['Home', 'Draw', 'Away'];

export function formatScore(correct: number | null | undefined, total: number): string {
  if (correct == null) return '—';
  return `${correct}/${total}`;
}

export function isSportsTournament(tournament: { tournamentType?: string } | null): boolean {
  return tournament?.tournamentType === 'SPORTS';
}
