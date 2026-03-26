import { sportsDbFetchV2 } from './api-sports-fetch';

/**
 * In-memory livescore cache.
 * Polls TheSportsDB V2 every 30s using the /livescore/all endpoint (single call).
 * Keyed by event ID (matches SportsFixtureCache.externalId for TheSportsDB sports).
 * Secondary index by team name for football pools (which use football-data.org IDs).
 */

export interface LiveScore {
  eventId: string;
  homeScore: number;
  awayScore: number;
  status: string;      // '1H', 'HT', '2H', 'FT', 'Q1', 'Q2', 'BT', 'P1', 'P2', 'P3', etc.
  progress: string;    // '45', '90+3', 'Q3 8:42', etc.
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;       // 'Soccer', 'Basketball', 'Ice Hockey', etc.
  homeTeamBadge: string;
  awayTeamBadge: string;
  updatedAt: number;   // timestamp ms
}

// Statuses that mean "not yet playing" or "finished"
const INACTIVE_STATUSES = new Set(['NS', 'FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO', 'AOT']);

const cache = new Map<string, LiveScore>();
// Secondary index: normalized team name → eventId (for football-data.org pools)
const teamNameIndex = new Map<string, string>();
let polling = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

function normalizeTeam(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Get live score for a specific event ID.
 */
export function getLiveScore(eventId: string): LiveScore | null {
  const entry = cache.get(eventId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > 120_000) return null;
  return entry;
}

/**
 * Get live score by team name (fallback for football pools with football-data.org IDs).
 */
export function getLiveScoreByTeam(homeTeam: string): LiveScore | null {
  const key = normalizeTeam(homeTeam);
  const eventId = teamNameIndex.get(key);
  if (!eventId) return null;
  return getLiveScore(eventId);
}

/**
 * Get all current live scores.
 */
export function getAllLiveScores(): LiveScore[] {
  const now = Date.now();
  return Array.from(cache.values()).filter(e => now - e.updatedAt < 120_000);
}

/**
 * Poll all sports for live scores using single /livescore/all call.
 */
async function pollLiveScores(): Promise<void> {
  try {
    const data = await sportsDbFetchV2('livescore/all');
    const events = data?.livescore || [];

    const sportCounts: Record<string, number> = {};

    for (const e of events) {
      if (!e.idEvent) continue;
      const status = (e.strStatus || '').trim();
      // Skip inactive events
      if (!status || INACTIVE_STATUSES.has(status)) continue;

      const sport = e.strSport || 'Unknown';
      sportCounts[sport] = (sportCounts[sport] || 0) + 1;

      const eventId = String(e.idEvent);
      const entry: LiveScore = {
        eventId,
        homeScore: Number(e.intHomeScore ?? 0),
        awayScore: Number(e.intAwayScore ?? 0),
        status,
        progress: (e.strProgress || '').trim(),
        homeTeam: e.strHomeTeam || '',
        awayTeam: e.strAwayTeam || '',
        league: e.strLeague || '',
        sport,
        homeTeamBadge: e.strHomeTeamBadge || '',
        awayTeamBadge: e.strAwayTeamBadge || '',
        updatedAt: Date.now(),
      };

      cache.set(eventId, entry);

      // Build team name index for football lookups
      if (e.strHomeTeam) {
        teamNameIndex.set(normalizeTeam(e.strHomeTeam), eventId);
      }
    }

    // Clean stale entries from cache (older than 3 min)
    const now = Date.now();
    for (const [key, val] of cache) {
      if (now - val.updatedAt > 180_000) cache.delete(key);
    }

    const summary = Object.entries(sportCounts).map(([s, n]) => `${s}:${n}`).join(', ');
    if (summary) {
      console.log(`[LiveScore] ${summary}`);
    }
  } catch (error) {
    // Silently skip — livescore is best-effort
  }
}

/**
 * Start polling livescores every 30s.
 */
export function startLiveScorePolling(): void {
  if (polling) return;
  polling = true;

  // Initial poll
  pollLiveScores().catch(() => {});

  // Poll every 30s
  pollInterval = setInterval(() => {
    pollLiveScores().catch(() => {});
  }, 30_000);

  console.log('[LiveScore] Polling started (every 30s)');
}

/**
 * Stop polling.
 */
export function stopLiveScorePolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  polling = false;
}
