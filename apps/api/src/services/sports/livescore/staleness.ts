import type { LiveScore } from './types';
import { FINISHED_STATUSES, SKIP_STATUSES, SCORE_FREEZE_THRESHOLD_MS, NS_STUCK_THRESHOLD_MS, MIDNIGHT_BUFFER_HOURS } from './types';
import { cacheGet, getLastScoreChangeAt } from './cache';

/**
 * Staleness detection for livescore data.
 * Determines when TheSportsDB data is unreliable and fallbacks should trigger.
 */

// ─── Individual event checks ─────────────────────────────────────────────────

/** True if the event's score/status hasn't changed for >5 min while it should be active */
export function isScoreFrozen(eventId: string): boolean {
  const entry = cacheGet(eventId);
  if (!entry) return false;

  // Only check active (non-finished, non-skip) events
  if (FINISHED_STATUSES.has(entry.status)) return false;
  if (SKIP_STATUSES.has(entry.status)) return false;

  const lastChange = getLastScoreChangeAt(eventId);
  if (!lastChange) return false;

  return Date.now() - lastChange > SCORE_FREEZE_THRESHOLD_MS;
}

/** True if status is NS/TBD but kickoff was > 30 min ago */
export function isStuckNS(eventId: string, kickoff: Date): boolean {
  const entry = cacheGet(eventId);
  const status = entry?.status;

  // No entry at all AND kickoff passed > 30min ago = also stuck
  if (!entry && Date.now() - kickoff.getTime() > NS_STUCK_THRESHOLD_MS) return true;

  // Entry with NS/TBD and kickoff well past
  if (status === 'NS' || status === 'TBD') {
    return Date.now() - kickoff.getTime() > NS_STUCK_THRESHOLD_MS;
  }

  return false;
}

/** True if we're in the midnight UTC boundary window (00:00-02:00 UTC) */
export function isMidnightBoundary(): boolean {
  const hour = new Date().getUTCHours();
  return hour < MIDNIGHT_BUFFER_HOURS;
}

// ─── Batch analysis ──────────────────────────────────────────────────────────

export interface StaleEvent {
  eventId: string;
  reason: 'DISAPPEARED' | 'NEVER_APPEARED' | 'STUCK_NS' | 'SCORE_FROZEN';
}

/**
 * Analyze active pool match IDs and return events that need individual lookup or ChatGPT fallback.
 * @param activePoolMatchIds Match IDs of pools that have started but not resolved
 * @param freshIds Event IDs present in the current /livescore/all poll
 * @param disappearedIds Event IDs that disappeared from the feed since last poll
 * @param poolKickoffs Map of matchId → kickoff time for stuck NS detection
 */
export function detectStaleEvents(
  activePoolMatchIds: string[],
  freshIds: Set<string>,
  disappearedIds: string[],
  poolKickoffs: Map<string, Date>,
): StaleEvent[] {
  const stale: StaleEvent[] = [];
  const seen = new Set<string>();

  // Disappeared events (highest priority — were live, now gone)
  for (const eventId of disappearedIds) {
    if (activePoolMatchIds.includes(eventId)) {
      stale.push({ eventId, reason: 'DISAPPEARED' });
      seen.add(eventId);
    }
  }

  for (const matchId of activePoolMatchIds) {
    if (seen.has(matchId)) continue;
    if (freshIds.has(matchId)) continue; // In the current feed, no problem

    const kickoff = poolKickoffs.get(matchId);

    // Stuck NS check
    if (kickoff && isStuckNS(matchId, kickoff)) {
      stale.push({ eventId: matchId, reason: 'STUCK_NS' });
      seen.add(matchId);
      continue;
    }

    // Score frozen check
    if (isScoreFrozen(matchId)) {
      stale.push({ eventId: matchId, reason: 'SCORE_FROZEN' });
      seen.add(matchId);
      continue;
    }

    // Never appeared (kickoff passed, never seen in feed, and not NS/TBD in cache)
    const entry = cacheGet(matchId);
    if (kickoff && Date.now() > kickoff.getTime()) {
      // If cached as NS/TBD, the game simply hasn't started — not stale
      if (entry && (entry.status === 'NS' || entry.status === 'TBD')) continue;
      if (!entry) {
        stale.push({ eventId: matchId, reason: 'NEVER_APPEARED' });
        seen.add(matchId);
      }
    }
  }

  return stale;
}
