// ── Time intervals ──────────────────────────────────────────────────────────
export const LIVESCORE_POLL_MS = 30_000;
export const CATEGORY_CACHE_TTL_MS = 60_000;
export const RATE_LIMIT_DELAY_MS = 7_000;
export const LIVESCORE_STALE_MS = 120_000;
export const LIVESCORE_CLEANUP_MS = 180_000;

// ── Pool durations ─────────────────────────────────────────────────────────
export const POOL_OPEN_HOURS_BEFORE = 720; // 30 days
export const PM_BUFFER_MS = 48 * 60 * 60 * 1000; // 48h buffer for PM pools
export const MATCH_DURATION_MS = 6 * 60 * 60 * 1000; // 6h for football matches

// ── Fees ────────────────────────────────────────────────────────────────────
export const FEE_BASIS_DIVISOR = 10_000n;

// ── Polymarket ──────────────────────────────────────────────────────────────
export const MAX_MARKETS_PER_CATEGORY = Number(process.env.POLYMARKET_MAX_MARKETS_PER_CATEGORY) || 10;
