/**
 * FIFA World Cup branding + identifiers, from TheSportsDB (league id 4429).
 * These CDN images come from SDB (same source as the team crests the app already
 * renders), so they're safe to use as plain <img> src.
 */
export const WORLD_CUP = {
  leagueId: '4429',
  leagueCode: 'FWC',
  name: 'FIFA World Cup',
  badge: 'https://r2.thesportsdb.com/images/media/league/badge/e7er5g1696521789.png',
  logo: 'https://r2.thesportsdb.com/images/media/league/logo/p1t6dc1777484937.png',
  fanart: 'https://r2.thesportsdb.com/images/media/league/fanart/khn32z1724783054.jpg',
} as const;

/** Promo copy (per-match contest; predictions lock at kickoff). */
export const WORLD_CUP_PROMO = {
  prize: '$100 to 2 people who guess the correct score',
  ends: 'Predict before kickoff',
} as const;

/** Neon-green accent used only for the LIVE indicator (bar + dot + minute). */
export const WC_NEON_GREEN = '#3DF07C';
