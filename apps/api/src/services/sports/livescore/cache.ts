import type { LiveScore } from './types';
import { CACHE_TTL_MS, CACHE_CLEANUP_MS, isFinishedStatus, normalizeTeam } from './types';

// ─── In-memory stores ────────────────────────────────────────────────────────

const cache = new Map<string, LiveScore>();
const teamNameIndex = new Map<string, string>(); // normalized team → eventId

// Staleness tracking
let previousPollIds = new Set<string>();
const lastScoreChangeAt = new Map<string, number>(); // eventId → timestamp

// ─── Cache getters ───────────────────────────────────────────────────────────

export function cacheGet(eventId: string): LiveScore | null {
  const entry = cache.get(eventId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > CACHE_TTL_MS) return null;
  return entry;
}

export function cacheGetByTeam(homeTeam: string): LiveScore | null {
  const key = normalizeTeam(homeTeam);
  const eventId = teamNameIndex.get(key);
  if (!eventId) return null;
  return cacheGet(eventId);
}

export function cacheGetAll(): LiveScore[] {
  const now = Date.now();
  return Array.from(cache.values()).filter(e => now - e.updatedAt < CACHE_TTL_MS);
}

export function cacheHas(eventId: string): boolean {
  return cache.has(eventId);
}

// ─── Cache setters ───────────────────────────────────────────────────────────

export function cacheSet(entry: LiveScore): void {
  // Track score changes for freeze detection
  const existing = cache.get(entry.eventId);
  if (existing) {
    const fingerprint = `${entry.homeScore}-${entry.awayScore}-${entry.status}-${entry.progress}`;
    const oldFingerprint = `${existing.homeScore}-${existing.awayScore}-${existing.status}-${existing.progress}`;
    if (fingerprint !== oldFingerprint) {
      lastScoreChangeAt.set(entry.eventId, Date.now());
    }
  } else {
    lastScoreChangeAt.set(entry.eventId, Date.now());
  }

  cache.set(entry.eventId, entry);

  // Build team name index for football lookups
  if (entry.homeTeam) {
    teamNameIndex.set(normalizeTeam(entry.homeTeam), entry.eventId);
  }
}

export function cacheDelete(eventId: string): void {
  cache.delete(eventId);
  lastScoreChangeAt.delete(eventId);
  // Clean corresponding team name index entries
  for (const [team, eid] of teamNameIndex) {
    if (eid === eventId) teamNameIndex.delete(team);
  }
}

// ─── Staleness tracking ─────────────────────────────────────────────────────

export function getLastScoreChangeAt(eventId: string): number | undefined {
  return lastScoreChangeAt.get(eventId);
}

/**
 * Update the set of event IDs seen in the last successful poll.
 * Returns the set of events that disappeared (were in previous poll but not in current).
 */
export function updatePreviousPollIds(currentIds: Set<string>): string[] {
  const disappeared = [...previousPollIds].filter(
    id => !currentIds.has(id) && cache.has(id) && !isFinishedStatus(cache.get(id)!.status),
  );
  previousPollIds = currentIds;
  return disappeared;
}

// ─── Bulk operations ─────────────────────────────────────────────────────────

/** Preload cache from DB entries on startup */
export function cachePreload(entries: LiveScore[]): void {
  for (const entry of entries) {
    cache.set(entry.eventId, entry);
    if (entry.homeTeam) {
      teamNameIndex.set(normalizeTeam(entry.homeTeam), entry.eventId);
    }
    lastScoreChangeAt.set(entry.eventId, entry.updatedAt);
  }
}

/** Clean stale entries from in-memory cache + team name index */
export function cacheCleanup(): void {
  const now = Date.now();
  for (const [key, val] of cache) {
    if (now - val.updatedAt > CACHE_CLEANUP_MS) {
      cache.delete(key);
      lastScoreChangeAt.delete(key);
      for (const [team, eid] of teamNameIndex) {
        if (eid === key) teamNameIndex.delete(team);
      }
    }
  }
}

/** Get cache size for metrics */
export function cacheSize(): number {
  return cache.size;
}
