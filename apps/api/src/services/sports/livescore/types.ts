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

// ─── Constants ───────────────────────────────────────────────────────────────

export const CACHE_TTL_MS = 1_200_000;          // 20 min — survives NHL/NBA intermissions
export const DB_FALLBACK_TTL_MS = 4 * 3_600_000; // 4h — max age for DB fallback results
export const DB_CLEANUP_AGE_MS = 24 * 3_600_000; // 24h — delete old DB entries
export const CACHE_CLEANUP_MS = 1_500_000;        // 25 min — stale cache eviction
export const POLL_INTERVAL_MS = 30_000;           // 30s — livescore polling interval
export const API_LOOKUP_LIMIT = 5;                // Max API lookups per resolver cycle

// Staleness & fallback
export const STALE_THRESHOLD_MS = 120_000;        // 2 min — re-fetch if data older than this
export const SCORE_FREEZE_THRESHOLD_MS = 300_000; // 5 min — flag score as frozen
export const NS_STUCK_THRESHOLD_MS = 1_800_000;   // 30 min — flag NS as stuck after kickoff
export const MIDNIGHT_BUFFER_HOURS = 2;           // Extra polling window around midnight UTC

// ChatGPT fallback
export const CHATGPT_COOLDOWN_MS = 60_000;        // 1 min per event
export const CHATGPT_MAX_PER_CYCLE = 3;           // Max ChatGPT calls per 30s cycle
export const CHATGPT_CIRCUIT_BREAKER_THRESHOLD = 3;
export const CHATGPT_CIRCUIT_BREAKER_COOLDOWN_MS = 300_000; // 5 min

// The Odds API — parallel source alongside TheSportsDB
export const ODDS_API_CREDIT_FLOOR = 50;           // Disable if fewer credits remaining

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
    .replace(/[^a-z0-9]/g, '');
}
