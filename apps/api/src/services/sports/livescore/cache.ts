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

/**
 * Cross-day-safe team-name lookup. Required after the 2026-06-03 incident
 * where the odds-api gap-fill matched a pool to YESTERDAY's same-team
 * game (Rays vs Tigers MLB series), silently resolving the pool as 0-8
 * before kickoff. The bare-name lookup the rest of the codebase used
 * (and that earlier callers relied on for football pools) has the same
 * class of bug.
 *
 * Pass the pool's `kickoffMs` so we can reject any cached entry whose
 * `updatedAt` is more than `MATCH_LIFE_WINDOW_MS` BEFORE kickoff —
 * yesterday's game finished hours before today's pool's kickoff and is
 * trivially rejected. The window is generous on the "after" side (UMA-
 * style: we keep accepting entries until the row is evicted) and only
 * tightens on the "before" side.
 */
const MATCH_LIFE_WINDOW_MS = 2 * 3_600_000; // 2h pre-kickoff is plenty
export function cacheGetByTeam(homeTeam: string, kickoffMs?: number): LiveScore | null {
  const key = normalizeTeam(homeTeam);
  const eventId = teamNameIndex.get(key);
  if (!eventId) return null;
  const entry = cacheGet(eventId);
  if (!entry) return null;
  if (kickoffMs != null && entry.updatedAt < kickoffMs - MATCH_LIFE_WINDOW_MS) {
    // entry is from a previous fixture — refuse to match it onto a
    // future / current pool that just happens to share team names.
    return null;
  }
  return entry;
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
