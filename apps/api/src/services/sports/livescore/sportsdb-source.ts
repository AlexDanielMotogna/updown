import { sportsDbFetchV2 } from '../api-sports-fetch';
import type { LiveScore } from './types';
import { SKIP_STATUSES, normalizeStatus } from './types';

// ─── Raw event parser ────────────────────────────────────────────────────────

function parseEvent(e: any): LiveScore | null {
  if (!e.idEvent) return null;
  const rawStatus = (e.strStatus || '').trim();
  if (!rawStatus) return null;
  if (SKIP_STATUSES.has(rawStatus)) return null;
  const status = normalizeStatus(rawStatus);

  return {
    eventId: String(e.idEvent),
    homeScore: Number(e.intHomeScore ?? 0),
    awayScore: Number(e.intAwayScore ?? 0),
    status,
    progress: (e.strProgress || '').trim(),
    homeTeam: e.strHomeTeam || '',
    awayTeam: e.strAwayTeam || '',
    league: e.strLeague || '',
    sport: e.strSport || 'Unknown',
    homeTeamBadge: e.strHomeTeamBadge || '',
    awayTeamBadge: e.strAwayTeamBadge || '',
    updatedAt: Date.now(),
  };
}

// ─── Data fetchers (pure — no side effects) ──────────────────────────────────

/**
 * Fetch all live scores across all sports.
 * Returns only active/finished events (SKIP_STATUSES filtered out).
 */
export async function fetchLivescoreAll(): Promise<LiveScore[]> {
  const data = await sportsDbFetchV2('livescore/all');
  const events = data?.livescore || [];
  const results: LiveScore[] = [];

  for (const e of events) {
    const parsed = parseEvent(e);
    if (parsed) results.push(parsed);
  }

  return results;
}

/**
 * Fetch live scores for a specific sport (e.g., 'Basketball', 'Ice Hockey').
 * Used as backup during midnight UTC boundary when /livescore/all drops games.
 */
export async function fetchLivescoreBySport(sport: string): Promise<LiveScore[]> {
  const data = await sportsDbFetchV2(`livescore/${encodeURIComponent(sport)}`);
  const events = data?.livescore || [];
  const results: LiveScore[] = [];

  for (const e of events) {
    const parsed = parseEvent(e);
    if (parsed) results.push(parsed);
  }

  return results;
}

/**
 * Fetch a single event by ID via individual lookup.
 * Returns null if event not found or status is NS/TBD/skip.
 */
export async function fetchEventLookup(eventId: string): Promise<LiveScore | null> {
  const data = await sportsDbFetchV2(`lookup/event/${eventId}`);
  const evt = data?.lookup?.[0];
  if (!evt) return null;

  const rawStatus = (evt.strStatus || '').trim();
  if (!rawStatus) return null;
  const status = normalizeStatus(rawStatus);

  return {
    eventId: String(evt.idEvent),
    homeScore: Number(evt.intHomeScore ?? 0),
    awayScore: Number(evt.intAwayScore ?? 0),
    status,
    progress: (evt.strProgress || '').trim(),
    homeTeam: evt.strHomeTeam || '',
    awayTeam: evt.strAwayTeam || '',
    league: evt.strLeague || '',
    sport: evt.strSport || '',
    homeTeamBadge: evt.strHomeTeamBadge || '',
    awayTeamBadge: evt.strAwayTeamBadge || '',
    updatedAt: Date.now(),
  };
}
