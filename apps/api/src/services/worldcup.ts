import { prisma } from '../db';
import { sportsDbFetch } from './sports/api-sports-fetch';
import { isFinishedStatus, normalizeStatus } from './sports/livescore';

/**
 * FIFA World Cup matches for the free predictions page (SDB league 4429).
 *
 * Schedule + results come from SDB (next + past events for the league); live status
 * and in-progress score are overlaid from the `live_scores` table the poller keeps.
 * Cached in-memory (short TTL) so the page can poll without hammering SDB.
 */

const WORLD_CUP_LEAGUE_ID = '4429';
const CACHE_TTL_MS = 60_000;

export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED';
export type MatchPhase = 'REGULATION' | 'EXTRA_TIME' | 'PENALTIES';

export interface WorldCupMatch {
  matchId: string;
  round: string | null;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  kickoff: string | null; // ISO
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  progress: string | null; // live minute, e.g. "72"
  phase: MatchPhase | null; // only for finished matches
  homePens: number | null; // penalty shootout score (finished + admin-confirmed)
  awayPens: number | null;
}

interface SdbEvent {
  idEvent?: string;
  strEvent?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
  dateEvent?: string;
  strTime?: string;
  strTimestamp?: string | null;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
  strStatus?: string | null;
  intRound?: string | null;
  strRound?: string | null;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function kickoffIso(e: SdbEvent): string | null {
  // SDB timestamps are UTC but often lack a timezone suffix; `new Date` would then
  // parse them as LOCAL time. Force UTC so the ISO instant is correct (the client
  // renders it in the user's own timezone via toLocaleString).
  if (e.strTimestamp) {
    const ts = /[zZ]|[+-]\d\d:?\d\d$/.test(e.strTimestamp) ? e.strTimestamp : `${e.strTimestamp}Z`;
    return new Date(ts).toISOString();
  }
  if (e.dateEvent) return new Date(`${e.dateEvent}T${e.strTime || '00:00:00'}Z`).toISOString();
  return null;
}

function derivePhase(rawStatus: string | null | undefined): MatchPhase {
  const s = (rawStatus || '').trim().toLowerCase();
  if (['pen', 'ap', 'after penalties', 'penalties', 'penalty_shootout', 'penalty shootout'].includes(s)) return 'PENALTIES';
  if (['aet', 'et', 'after extra time', 'extra_time', 'extra time'].includes(s)) return 'EXTRA_TIME';
  return 'REGULATION';
}

// SDB encodes knockout rounds as numeric codes (125 = Round of 16, 150 = QF, ...) and is
// inconsistent (some FWC events use "16", others "125" for the same round). Normalize to a
// clean label. Group matchdays come as 1-3; anything >=4 or a known code is a knockout round.
const ROUND_LABELS: Record<string, string> = {
  '32': 'Round of 32',
  '16': 'Round of 16', '125': 'Round of 16',
  '8': 'Quarter-final', '150': 'Quarter-final',
  '4': 'Semi-final', '160': 'Semi-final',
  '170': 'Third place',
  '200': 'Final',
};
function normalizeRound(strRound?: string | null, intRound?: string | null): string | null {
  const rawStr = (strRound || '').trim();
  if (rawStr && /[a-z]/i.test(rawStr)) return rawStr; // SDB already gave a human label
  const raw = rawStr || (intRound || '').toString().trim();
  if (!raw) return null;
  if (ROUND_LABELS[raw]) return ROUND_LABELS[raw];
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 3) return `Matchday ${n}`;
  return `Round ${raw}`;
}

function mapEvent(e: SdbEvent): WorldCupMatch {
  const raw = (e.strStatus || '').trim();
  const kickoff = kickoffIso(e);
  const finished = isFinishedStatus(raw);
  // A match in the "past events" feed can still be IN PROGRESS (kickoff passed but
  // not finished) — don't trust the feed, derive from status + kickoff time.
  const started = kickoff != null && Date.parse(kickoff) <= Date.now();
  const status: MatchStatus = finished ? 'FINISHED' : started ? 'LIVE' : 'SCHEDULED';
  return {
    matchId: String(e.idEvent),
    round: normalizeRound(e.strRound, e.intRound),
    homeTeam: e.strHomeTeam || '',
    awayTeam: e.strAwayTeam || '',
    homeCrest: e.strHomeTeamBadge || null,
    awayCrest: e.strAwayTeamBadge || null,
    kickoff,
    status,
    homeScore: status === 'SCHEDULED' ? null : toNum(e.intHomeScore),
    awayScore: status === 'SCHEDULED' ? null : toNum(e.intAwayScore),
    progress: null,
    phase: finished ? derivePhase(raw) : null,
    homePens: null,
    awayPens: null,
  };
}

let cache: { at: number; data: WorldCupMatch[] } | null = null;

export async function getWorldCupMatches(): Promise<WorldCupMatch[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const [next, past] = await Promise.all([
    sportsDbFetch<{ events: SdbEvent[] | null }>(`eventsnextleague.php?id=${WORLD_CUP_LEAGUE_ID}`).catch(() => ({ events: null })),
    sportsDbFetch<{ events: SdbEvent[] | null }>(`eventspastleague.php?id=${WORLD_CUP_LEAGUE_ID}`).catch(() => ({ events: null })),
  ]);

  const byId = new Map<string, WorldCupMatch>();
  for (const e of past.events ?? []) {
    const m = mapEvent(e);
    if (m.matchId) byId.set(m.matchId, m);
  }
  for (const e of next.events ?? []) {
    const m = mapEvent(e);
    if (m.matchId && !byId.has(m.matchId)) byId.set(m.matchId, m);
  }

  // Overlay live_scores: mark in-progress matches LIVE with their current score/minute,
  // and fill finished scores the SDB league feed may lag on.
  const ids = [...byId.keys()];
  if (ids.length > 0) {
    const live = await prisma.liveScore.findMany({ where: { eventId: { in: ids } } }).catch(() => []);
    const FRESH_MS = 4 * 3_600_000; // ignore stale live rows for LIVE classification
    for (const row of live) {
      const m = byId.get(row.eventId);
      if (!m) continue;
      const finished = isFinishedStatus(row.status);
      const fresh = Date.now() - new Date(row.updatedAt).getTime() < FRESH_MS;

      // The past-events feed is authoritative for FINISHED — a stale live row must
      // NOT flip a finished match back to LIVE. Just refresh its final score/phase.
      if (m.status === 'FINISHED') {
        if (finished) {
          m.homeScore = row.homeScore;
          m.awayScore = row.awayScore;
          m.phase = derivePhase(normalizeStatus(row.status));
        }
        continue;
      }

      // Match was SCHEDULED. A finished live row promotes it to FINISHED; a fresh
      // non-finished row means it's in progress now.
      if (finished) {
        m.status = 'FINISHED';
        m.homeScore = row.homeScore;
        m.awayScore = row.awayScore;
        m.phase = derivePhase(normalizeStatus(row.status));
      } else if (fresh) {
        m.status = 'LIVE';
        m.homeScore = row.homeScore;
        m.awayScore = row.awayScore;
        m.progress = row.progress || null;
        m.phase = null;
      }
    }
  }

  // Overlay admin-confirmed official results so completed matches show the REAL result,
  // including the penalty shootout SDB doesn't expose (populated via the admin, ChatGPT-assisted).
  const finishedIds = [...byId.values()].filter((m) => m.status === 'FINISHED').map((m) => m.matchId);
  if (finishedIds.length > 0) {
    const results = await prisma.worldCupResult.findMany({ where: { matchId: { in: finishedIds } } }).catch(() => []);
    for (const r of results) {
      const m = byId.get(r.matchId);
      if (!m) continue;
      m.homeScore = r.homeScore;
      m.awayScore = r.awayScore;
      m.phase = r.phase;
      m.homePens = r.homePens ?? null;
      m.awayPens = r.awayPens ?? null;
    }
  }

  // Order: LIVE first, then upcoming (soonest first), then finished (most recent first).
  const rank = (m: WorldCupMatch) => (m.status === 'LIVE' ? 0 : m.status === 'SCHEDULED' ? 1 : 2);
  const data = [...byId.values()].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const at = a.kickoff ? Date.parse(a.kickoff) : 0;
    const bt = b.kickoff ? Date.parse(b.kickoff) : 0;
    return a.status === 'FINISHED' ? bt - at : at - bt;
  });

  cache = { at: Date.now(), data };
  return data;
}
