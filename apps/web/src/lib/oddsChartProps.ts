/**
 * Single source of truth for how a Pool maps onto the OddsChart's `labels`
 * and `icons` props. Every surface that mounts an OddsChart (FeaturedHero,
 * match page, future ones) goes through here so the chart's hover
 * tooltip + endpoint badges read the same identity end-to-end with the
 * cards.
 *
 * Outcome shapes:
 *   - Crypto pools           → UP / DOWN PNG icons.
 *   - PM Yes/No              → cyan ✓ / red ✗ SVG glyphs.
 *   - PM Up/Down (Polymarket
 *     "price-move" style)    → same UP / DOWN PNG icons crypto uses.
 *   - PM with answer pairs   → question banner on both sides.
 *   - Sports (2 or 3-way)    → team crests; Draw uses a coloured dot.
 *
 * Returns null for icon slots that have no image to render so the chart
 * can fall back to a coloured dot.
 */

import { YES_ICON, NO_ICON, UP_ICON, DOWN_ICON } from './predictionIcons';

interface PoolLike {
  asset?: string | null;
  poolType?: string | null;
  league?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  homeTeamCrest?: string | null;
  awayTeamCrest?: string | null;
  numSides?: number | null;
}

export interface OddsChartIdentity {
  labels: { up?: string; down?: string; draw?: string };
  icons: { up?: string | null; down?: string | null; draw?: string | null };
  threeWay: boolean;
  /** True when we want the chart to default to the "live" liveness pulse — used by
   *  callers that lock the source toggle to UpDown so the header shows LIVE. */
  isPrediction: boolean;
  isCrypto: boolean;
  isYesNoPm: boolean;
  isUpDownPm: boolean;
}

const lc = (s?: string | null) => s?.toLowerCase();

export function resolveOddsChartIdentity(pool: PoolLike): OddsChartIdentity {
  const isPrediction = !!pool.league?.startsWith('PM_');
  const isCrypto = pool.poolType !== 'SPORTS';
  const threeWay = (pool.numSides ?? 2) === 3;

  const isYesNoPm = isPrediction && !pool.awayTeam;
  const isUpDownPm =
    isPrediction &&
    !!pool.awayTeam &&
    lc(pool.homeTeam) === 'up' &&
    lc(pool.awayTeam) === 'down';

  // ── Labels (text shown on tooltip + badge) ─────────────────────────
  let labels: OddsChartIdentity['labels'];
  if (isCrypto) {
    labels = { up: 'Up', down: 'Down' };
  } else if (isYesNoPm) {
    labels = { up: 'Yes', down: 'No' };
  } else if (isUpDownPm) {
    // Use the stored casing rather than forcing UPPERCASE — Polymarket
    // ships "Up" / "Down" and that reads cleaner than "UP" / "DOWN".
    labels = { up: pool.homeTeam ?? 'Up', down: pool.awayTeam ?? 'Down' };
  } else if (isPrediction) {
    labels = { up: pool.homeTeam ?? 'Yes', down: pool.awayTeam ?? 'No' };
  } else {
    // Sports
    labels = {
      up: pool.homeTeam ?? 'Home',
      down: pool.awayTeam ?? 'Away',
      ...(threeWay ? { draw: 'Draw' } : {}),
    };
  }

  // ── Icons (image shown on tooltip + badge) ─────────────────────────
  let icons: OddsChartIdentity['icons'];
  if (isCrypto || isUpDownPm) {
    icons = { up: UP_ICON, down: DOWN_ICON };
  } else if (isYesNoPm) {
    icons = { up: YES_ICON, down: NO_ICON };
  } else if (isPrediction) {
    // Question-thumbnail style PM with answer-pair sides — show the same
    // banner on both halves so the user still recognises the market.
    icons = { up: pool.homeTeamCrest ?? null, down: pool.homeTeamCrest ?? null };
  } else {
    // Sports
    icons = {
      up: pool.homeTeamCrest ?? null,
      down: pool.awayTeamCrest ?? null,
      ...(threeWay ? { draw: null } : {}),
    };
  }

  return { labels, icons, threeWay, isPrediction, isCrypto, isYesNoPm, isUpDownPm };
}
