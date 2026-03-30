/**
 * Livescore service — public API.
 *
 * This module is a drop-in replacement for the old monolithic livescore.ts.
 * All imports from '../livescore' resolve here automatically.
 */

// Re-export constants used by fixture-cache.ts
export { FINISHED_STATUSES, API_LOOKUP_LIMIT } from './types';
export type { LiveScore } from './types';

// Re-export lifecycle
export { startLiveScorePolling, stopLiveScorePolling } from './poller';

// Re-export metrics for admin
export { getMetrics as getLivescoreMetrics } from './metrics';

// ─── Public getters (async — cache + DB fallback) ────────────────────────────

import { cacheGet, cacheGetByTeam, cacheGetAll } from './cache';
import { getFromDb, getFromDbByTeam, getAllFromDb } from './db-persistence';

export async function getLiveScoreWithFallback(eventId: string) {
  // 1. Check cache first
  const cached = cacheGet(eventId);
  if (cached) return cached;

  // 2. Fallback to DB
  return getFromDb(eventId);
}

export async function getLiveScoreByTeamWithFallback(homeTeam: string) {
  // 1. Check cache
  const cached = cacheGetByTeam(homeTeam);
  if (cached) return cached;

  // 2. Fallback to DB
  return getFromDbByTeam(homeTeam);
}

export async function getAllLiveScoresWithFallback() {
  // Merge cache + DB: cache is primary, DB fills gaps
  const cached = cacheGetAll();
  const cacheIds = new Set(cached.map(e => e.eventId));

  const dbExtras = await getAllFromDb();
  const extras = dbExtras.filter(r => !cacheIds.has(r.eventId));

  return [...cached, ...extras];
}
