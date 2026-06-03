/**
 * Livescore service - public API.
 *
 * This module is a drop-in replacement for the old monolithic livescore.ts.
 * All imports from '../livescore' resolve here automatically.
 */

// Re-export constants used by fixture-cache.ts
export { FINISHED_STATUSES, API_LOOKUP_LIMIT, isFinishedStatus, normalizeStatus } from './types';
export type { LiveScore } from './types';

// Re-export lifecycle
export { startLiveScorePolling, stopLiveScorePolling } from './poller';

// Re-export metrics for admin
export { getMetrics as getLivescoreMetrics } from './metrics';

// ─── Public getters (async - cache + DB fallback) ────────────────────────────

import { cacheGet, cacheGetByTeam, cacheGetAll } from './cache';
import { getFromDb, getFromDbByTeam, getAllFromDb } from './db-persistence';

export async function getLiveScoreWithFallback(eventId: string) {
  // 1. Check cache first
  const cached = cacheGet(eventId);
  if (cached) return cached;

  // 2. Fallback to DB
  return getFromDb(eventId);
}

/**
 * Team-name livescore lookup used by football pools (whose matchId
 * comes from football-data.org and doesn't match the SDB eventId we
 * cache scores under). `kickoffMs` is REQUIRED for safety — without it
 * we'd happily return yesterday's same-team game when both clubs play
 * back-to-back fixtures. See cacheGetByTeam / getFromDbByTeam comments
 * for the rejection rule.
 */
export async function getLiveScoreByTeamWithFallback(homeTeam: string, kickoffMs: number) {
  // 1. Check cache
  const cached = cacheGetByTeam(homeTeam, kickoffMs);
  if (cached) return cached;

  // 2. Fallback to DB
  return getFromDbByTeam(homeTeam, kickoffMs);
}

export async function getAllLiveScoresWithFallback() {
  // Merge cache + DB: cache is primary, DB fills gaps
  const cached = cacheGetAll();
  const cacheIds = new Set(cached.map(e => e.eventId));

  const dbExtras = await getAllFromDb();
  const extras = dbExtras.filter(r => !cacheIds.has(r.eventId));

  return [...cached, ...extras];
}
