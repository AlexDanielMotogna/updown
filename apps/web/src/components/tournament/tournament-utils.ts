// ─── Design tokens ───────────────────────────────────────────────────────────

export const BG = '#0B0F14';
export const SURFACE = '#111820';
export const BORDER = 'rgba(255,255,255,0.06)';
export const MATCH_W = 280;
export const CARD_H = 124;
export const CARD_GAP = 32;
export const PREDICT_COLOR = '#818CF8';

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

export function formatOutcome(prediction: string | null | undefined): string {
  if (!prediction) return '—';
  const n = Number(prediction);
  if (n === 1) return 'Home';
  if (n === 2) return 'Draw';
  if (n === 3) return 'Away';
  return '—';
}

export function isSportsTournament(tournament: { tournamentType?: string } | null): boolean {
  return tournament?.tournamentType === 'SPORTS';
}
