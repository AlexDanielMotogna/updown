/**
 * Prediction Score — an ELO-style competitive rating for a predictor.
 *
 * v1 is DERIVED from the player's aggregate performance rather than updated
 * per-match: a true ELO needs the implied odds at the moment of each bet
 * (which we don't store per-bet yet) plus server-side rating state. This
 * derived score behaves ELO-like (1000 baseline, scales with skill, damped by
 * sample size) so we can surface the competitive number now and swap in a real
 * per-resolution ELO later without changing the UI.
 *
 * Baseline 1000. A brand-new account sits near 1000 and moves as the record
 * grows — early results barely move it (low confidence) so a 2-bet 100% streak
 * can't mint a "Master".
 */

export interface ScoreInput {
  /** Win rate as a percentage, 0–100. */
  winRate: number;
  /** ROI as a percentage, e.g. +17.2. */
  roi: number;
  /** Settled predictions — the sample size that gates confidence. */
  totalBets: number;
  /** Best win streak. */
  bestStreak: number;
}

export function computePredictionScore(i: ScoreInput): number {
  // Confidence ramps to full over ~30 settled predictions.
  const confidence = Math.min(1, Math.max(0, i.totalBets) / 30);
  const winComponent = (i.winRate - 50) * 8;                       // ±400 at 0/100%
  const roiComponent = Math.max(-300, Math.min(400, i.roi * 6));   // capped
  const streakBonus = Math.min(80, Math.max(0, i.bestStreak) * 12);
  const raw = 1000 + confidence * (winComponent + roiComponent + streakBonus);
  return Math.max(100, Math.round(raw));
}

export interface Tier {
  label: string;
  /** 0 (lowest) … 5 (highest) — maps to a colour in the UI. */
  level: number;
}

export function getTier(score: number): Tier {
  if (score >= 2000) return { label: 'Master', level: 5 };
  if (score >= 1600) return { label: 'Elite', level: 4 };
  if (score >= 1300) return { label: 'Sharp', level: 3 };
  if (score >= 1100) return { label: 'Skilled', level: 2 };
  if (score >= 900) return { label: 'Novice', level: 1 };
  return { label: 'Rookie', level: 0 };
}
