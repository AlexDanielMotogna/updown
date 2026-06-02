/**
 * Resolve a category's badgeBgColor field to an actual CSS background.
 *
 * Most TheSportsDB league badges have transparent backgrounds with mid-
 * tone colourful content — they look good on the historical light bg.
 * But some leagues ship white-on-transparent logos (CL trophy outline,
 * MLS shield, some basketball leagues). Those vanish on a white surface
 * and need a dark background.
 *
 * The backend pixel-samples each badge once and stores 'light' | 'dark'
 * on PoolCategory.badgeBgColor. Frontend just maps to a colour. The
 * operator can override with an explicit '#RRGGBB' literal in the admin
 * Categories edit dialog.
 *
 *   null / undefined → light (historical default)
 *   'light'          → rgba(255,255,255,0.85)
 *   'dark'           → rgba(0,0,0,0.6)
 *   '#RRGGBB'        → that literal hex
 */
const LIGHT_BG = 'rgba(255,255,255,0.85)';
const DARK_BG = 'rgba(15,23,42,0.85)';   // slate-900-ish to match the public app
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function resolveBadgeBackground(badgeBgColor: string | null | undefined): string {
  if (!badgeBgColor) return LIGHT_BG;
  if (badgeBgColor === 'light') return LIGHT_BG;
  if (badgeBgColor === 'dark') return DARK_BG;
  if (HEX_RE.test(badgeBgColor)) return badgeBgColor;
  return LIGHT_BG;
}
