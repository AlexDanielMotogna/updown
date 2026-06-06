/**
 * Inline data-URL SVG icons for the Yes / No outcomes on prediction
 * markets. Shipped as data URLs so every card / chart / modal can drop
 * them into an `<img src>` without us having to ship new PNG assets or
 * couple to MUI icon imports in places that don't otherwise need them.
 *
 * Crypto pools already have proper PNGs at /assets/up-icon-64x64.png
 * and /assets/down-icon-64x64.png - those are re-exported here as
 * UP_ICON / DOWN_ICON so every "outcome icon" import in the app comes
 * from a single place.
 */

const YES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#5FD8EF" stroke="#5FD8EF" stroke-width="1.5"/><path d="M7 12.5 l3 3 l7-7" stroke="#0B141F" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const NO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#F87171" stroke="#F87171" stroke-width="1.5"/><path d="M8 8 l8 8 M16 8 l-8 8" stroke="#0B141F" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>`;

export const YES_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(YES_SVG)}`;
export const NO_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(NO_SVG)}`;
export const UP_ICON = '/assets/up-icon-64x64.png';
export const DOWN_ICON = '/assets/down-icon-64x64.png';

/**
 * Pick the right outcome icon URL for a card / chart row.
 *
 * - Crypto pools → UP / DOWN PNGs (green / red triangles).
 * - PM Yes/No markets → YES / NO inline SVGs (cyan check / red cross).
 * - Anything else (sports with teams, 3-way, etc.) → null so the caller
 *   can fall back to the team crest or a coloured dot.
 *
 * `side` is the on-chain side enum we use everywhere (`'UP' | 'DOWN'`).
 */
export function outcomeIconFor(opts: {
  side: 'UP' | 'DOWN';
  isCrypto: boolean;
  isYesNo: boolean;
}): string | null {
  if (opts.isCrypto) return opts.side === 'UP' ? UP_ICON : DOWN_ICON;
  if (opts.isYesNo) return opts.side === 'UP' ? YES_ICON : NO_ICON;
  return null;
}
