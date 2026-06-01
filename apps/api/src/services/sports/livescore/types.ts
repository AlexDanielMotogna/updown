// ─── Types ───────────────────────────────────────────────────────────────────

export interface LiveScore {
  eventId: string;
  homeScore: number;
  awayScore: number;
  status: string;      // Raw TheSportsDB status code
  progress: string;    // '45', '90+3', 'Q3 8:42', etc.
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;       // 'Soccer', 'Basketball', 'Ice Hockey', etc.
  homeTeamBadge: string;
  awayTeamBadge: string;
  updatedAt: number;   // timestamp ms
}

// ─── Status classification ───────────────────────────────────────────────────

/** Statuses where the event should be removed from cache (not playable, no score) */
export const SKIP_STATUSES = new Set([
  'NS', 'TBD',                          // Not started
  'PST', 'POST',                         // Postponed
  'CANC',                                // Cancelled
  'ABD',                                 // Abandoned
  'AWD', 'AW',                           // Awarded / technical loss
  'WO',                                  // Walkover
  'SUSP',                                // Suspended
  'INT', 'INTR',                         // Interrupted
]);

/** Statuses that mean the match is finished (keep in cache for final score) */
export const FINISHED_STATUSES = new Set([
  'FT',                                  // Full Time
  'AET',                                 // After Extra Time
  'PEN',                                 // After Penalties (soccer)
  'AOT',                                 // After Overtime
  'AP',                                  // After Penalties (hockey/handball)
]);

/** Map variant status strings from TheSportsDB to canonical codes */
const FINISHED_STATUS_MAP: Record<string, string> = {
  'ft': 'FT', 'full time': 'FT', 'match finished': 'FT', 'finished': 'FT', 'final': 'FT',
  'aet': 'AET', 'after extra time': 'AET',
  'pen': 'PEN', 'after penalties': 'PEN', 'penalties': 'PEN',
  'aot': 'AOT', 'after overtime': 'AOT', 'overtime': 'AOT', 'final/ot': 'AOT',
  'ap': 'AP', 'final/so': 'AP',
};

/** Normalize any status string to its canonical form (e.g. "Match Finished" → "FT") */
export function normalizeStatus(raw: string): string {
  return FINISHED_STATUS_MAP[raw.trim().toLowerCase()] || raw.trim();
}

/** Check if a raw status string means the match is finished */
export function isFinishedStatus(raw: string): boolean {
  return FINISHED_STATUSES.has(normalizeStatus(raw));
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const CACHE_TTL_MS = 1_200_000;          // 20 min - survives NHL/NBA intermissions
export const DB_FALLBACK_TTL_MS = 4 * 3_600_000; // 4h - max age for DB fallback results
export const DB_CLEANUP_AGE_MS = 24 * 3_600_000; // 24h - delete old DB entries
export const CACHE_CLEANUP_MS = 1_500_000;        // 25 min - stale cache eviction
export const POLL_INTERVAL_MS = 30_000;           // 30s - livescore polling interval
export const API_LOOKUP_LIMIT = 15;               // Max API lookups per resolver cycle

// Staleness & fallback
export const STALE_THRESHOLD_MS = 120_000;        // 2 min - re-fetch if data older than this
export const SCORE_FREEZE_THRESHOLD_MS = 300_000; // 5 min - flag score as frozen
export const NS_STUCK_THRESHOLD_MS = 1_800_000;   // 30 min - flag NS as stuck after kickoff
export const MIDNIGHT_BUFFER_HOURS = 2;           // Extra polling window around midnight UTC

// ChatGPT fallback
export const CHATGPT_COOLDOWN_MS = 60_000;        // 1 min per event
export const CHATGPT_MAX_PER_CYCLE = 3;           // Max ChatGPT calls per 30s cycle
export const CHATGPT_CIRCUIT_BREAKER_THRESHOLD = 3;
export const CHATGPT_CIRCUIT_BREAKER_COOLDOWN_MS = 300_000; // 5 min

// The Odds API - fallback source alongside TheSportsDB
export const ODDS_API_CREDIT_FLOOR = 50;           // Disable if fewer credits remaining

// ─── Phase B (PLAN-LIVESCORE-SOURCE-SPLIT) ─────────────────────────────
// Odds API only overrides SDB with an FT signal after the match is clearly
// past expected end (kickoff + EXPECTED_MATCH_DURATION_MS[league] + grace).
// Until then the UI shows "Awaiting result" and we keep waiting on SDB so
// regulation-time semantics (AET/PEN collapse to DRAW via regulationWinner)
// stay intact.

/** Grace past expected match end before we accept Odds API's `completed:true`. */
export const ODDS_API_FT_FALLBACK_GRACE_MS = 5 * 60_000;

/**
 * Leagues where we NEVER use the Odds API FT fallback. Knockout cup ties
 * may go to extra time / penalties; Odds API's `completed:true` only sees
 * the post-ET score and would resolve to the ET winner instead of letting
 * `regulationWinner()` collapse to DRAW for the 90' bet. SDB is the only
 * feed that exposes `strStatus=AET/PEN`, so for these leagues we wait on
 * SDB indefinitely.
 */
export const KNOCKOUT_DISABLE_ODDS_FALLBACK = new Set(['CL', 'EL']);

/**
 * Per-league wall-clock duration after which a match is "expected to be
 * over" — used by the FT fallback gate AND by the frontend's "Awaiting
 * result" badge. Soccer regular season ~115 min (90 reg + 15 break + 10
 * stoppage); soccer knockouts longer because of ET; US sports include
 * timeouts/commercials.
 */
export const EXPECTED_MATCH_DURATION_MS: Record<string, number> = {
  // Soccer regular season
  BSA: 115 * 60_000, PL: 115 * 60_000, PD: 115 * 60_000, SA: 115 * 60_000,
  BL1: 115 * 60_000, FL1: 115 * 60_000, ELC: 115 * 60_000,
  DED: 115 * 60_000, PPL: 115 * 60_000,
  // Soccer knockouts (ET + pens) — also gated by KNOCKOUT_DISABLE_ODDS_FALLBACK
  CL: 155 * 60_000, EL: 155 * 60_000,
  // US sports
  NBA: 150 * 60_000,
  NHL: 150 * 60_000,
  NFL: 210 * 60_000,
  MMA: 180 * 60_000,
  MLB: 210 * 60_000,
};
export const DEFAULT_EXPECTED_DURATION_MS = 120 * 60_000;

/** Wall-clock instant at which we consider a match "should be over". */
export function expectedMatchEnd(kickoffMs: number, league: string | null | undefined): number {
  const dur = (league ? EXPECTED_MATCH_DURATION_MS[league] : undefined) ?? DEFAULT_EXPECTED_DURATION_MS;
  return kickoffMs + dur;
}

/** True when now > expectedMatchEnd + ODDS_API_FT_FALLBACK_GRACE_MS. */
export function isPastFtGraceWindow(kickoffMs: number, league: string | null | undefined): boolean {
  return Date.now() > expectedMatchEnd(kickoffMs, league) + ODDS_API_FT_FALLBACK_GRACE_MS;
}

/** Maps our league codes to The Odds API sport keys */
export const LEAGUE_TO_ODDS_API: Record<string, string> = {
  // US Sports
  NBA: 'basketball_nba',
  NHL: 'icehockey_nhl',
  NFL: 'americanfootball_nfl',
  MMA: 'mma_mixed_martial_arts',
  MLB: 'baseball_mlb',
  // Football
  PL:  'soccer_epl',
  PD:  'soccer_spain_la_liga',
  CL:  'soccer_uefa_champs_league',
  EL:  'soccer_uefa_europa_league',
  SA:  'soccer_italy_serie_a',
  BL1: 'soccer_germany_bundesliga',
  FL1: 'soccer_france_ligue_one',
  BSA: 'soccer_brazil_campeonato',
  ELC: 'soccer_efl_champ',
  DED: 'soccer_netherlands_eredivisie',
  PPL: 'soccer_portugal_primeira_liga',
  // Other sports
  TENNIS: 'tennis_atp_french_open',
  RUGBY:  'rugbyleague_nrl',
  BOXING: 'mma_mixed_martial_arts',
  CRICKET: 'cricket_ipl',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function normalizeTeam(name: string): string {
  return name
    .normalize('NFD')               // decompose accents: ã → a + combining mark
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks
    .toLowerCase()
    // Brazilian state suffixes ("-SP", "-RJ", "-MG", etc.) are the most
    // common diff between The Odds API ("Bragantino-SP") and our DB team
    // names ("Bragantino"). Strip the two-letter trailer BEFORE the
    // alphanumeric squash so both names collapse to the same key.
    .replace(/-[a-z]{2}$/, '')
    .replace(/[^a-z0-9]/g, '');
}
