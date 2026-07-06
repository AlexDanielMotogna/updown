import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { sportsDbFetch } from './sports/api-sports-fetch';
import { isFinishedStatus, normalizeStatus } from './sports/livescore';
import { fetchWorldCupResultFromChatGPT } from './worldcup-llm';

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

/** SDB explicitly says the match has NOT started (or is empty/postponed). */
function isNotStartedStatus(raw: string | null | undefined): boolean {
  const s = (raw || '').trim().toLowerCase();
  return s === '' || ['ns', 'not started', 'tbd', 'sched', 'scheduled', 'postponed', 'postp', 'ppd', 'cancelled', 'canceled', 'canc', 'abandoned'].includes(s);
}

function mapEvent(e: SdbEvent): WorldCupMatch {
  const raw = (e.strStatus || '').trim();
  const kickoff = kickoffIso(e);
  const finished = isFinishedStatus(raw);
  const notStarted = isNotStartedStatus(raw);
  // Trust SDB's explicit "not started" (NS) over the stored kickoff time — SDB's time can be
  // off (early), and a passed-but-NS match must stay SCHEDULED, not flip to LIVE and vanish.
  // Only fall back to the kickoff heuristic for a non-NS, non-finished (in-progress) status.
  const started = kickoff != null && Date.parse(kickoff) <= Date.now();
  const status: MatchStatus = finished ? 'FINISHED' : notStarted ? 'SCHEDULED' : started ? 'LIVE' : 'SCHEDULED';
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

export interface WorldCupGoal {
  side: 'home' | 'away';
  player: string;
  minute: number | null;
  kind: 'GOAL' | 'PENALTY' | 'OWN_GOAL';
}

interface SdbTimelineItem {
  strTimeline?: string;
  strTimelineDetail?: string;
  strHome?: string;
  strPlayer?: string;
  intTime?: string;
}

function parseTimeline(items: SdbTimelineItem[] | null | undefined): WorldCupGoal[] {
  const goals: WorldCupGoal[] = [];
  for (const it of items ?? []) {
    if ((it.strTimeline || '').toLowerCase() !== 'goal') continue;
    const detail = (it.strTimelineDetail || '').toLowerCase();
    // SDB logs missed/saved/disallowed penalties as strTimeline "Goal" too — those aren't goals.
    if (detail.includes('miss') || detail.includes('saved') || detail.includes('cancel') || detail.includes('disallow')) continue;
    const minute = it.intTime != null && it.intTime !== '' ? Number(it.intTime) : null;
    if (minute != null && (!Number.isFinite(minute) || minute > 125)) continue; // skip shootout pens
    // SDB attributes each goal (own goals included) to the team that gets it, via strHome.
    const side: 'home' | 'away' = it.strHome === 'Yes' ? 'home' : 'away';
    const kind = detail.includes('own') ? 'OWN_GOAL' : detail.includes('penalty') ? 'PENALTY' : 'GOAL';
    goals.push({ side, player: it.strPlayer || 'Unknown', minute, kind });
  }
  goals.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
  return goals;
}

async function fetchTimelineFromSdb(matchId: string): Promise<WorldCupGoal[]> {
  const res = await sportsDbFetch<{ timeline: SdbTimelineItem[] | null }>(`lookuptimeline.php?id=${matchId}`).catch(() => ({ timeline: null }));
  return parseTimeline(res.timeline);
}

/** Goals (scorer + minute) for a match. Persisted in the DB so the accordion loads fast:
 *  finished matches are served permanently from cache; live ones refresh every ~45s. */
export async function getWorldCupTimeline(matchId: string): Promise<WorldCupGoal[]> {
  const match = (await getWorldCupMatches()).find((m) => m.matchId === matchId);
  if (match && match.status === 'SCHEDULED') return []; // no goals before kickoff
  const finished = match?.status === 'FINISHED';

  const cached = await prisma.worldCupGoalCache.findUnique({ where: { matchId } }).catch(() => null);
  if (cached && (finished || Date.now() - new Date(cached.updatedAt).getTime() < 30_000)) {
    return cached.goals as unknown as WorldCupGoal[];
  }

  const goals = await fetchTimelineFromSdb(matchId);
  if (goals.length > 0 || !cached) {
    await prisma.worldCupGoalCache
      .upsert({
        where: { matchId },
        update: { goals: goals as unknown as Prisma.InputJsonValue },
        create: { matchId, goals: goals as unknown as Prisma.InputJsonValue },
      })
      .catch(() => {});
  }
  // If SDB momentarily returned nothing, keep whatever we had cached.
  return goals.length > 0 ? goals : ((cached?.goals as unknown as WorldCupGoal[]) ?? []);
}

let cache: { at: number; data: WorldCupMatch[] } | null = null;

// Background ChatGPT lookup for a penalty shootout SDB didn't expose (display only). Writes
// to the cache so a later poll shows "Penalties X-Y"; never blocks the request or grading.
const pensInFlight = new Set<string>();
const PENS_RETRY_MS = 3_600_000; // re-ask hourly while a match stays unresolved
async function fillPenaltyShootout(m: WorldCupMatch): Promise<void> {
  if (pensInFlight.has(m.matchId)) return;
  pensInFlight.add(m.matchId);
  try {
    const date = m.kickoff ? m.kickoff.slice(0, 10) : '';
    const { result } = await fetchWorldCupResultFromChatGPT({ homeTeam: m.homeTeam, awayTeam: m.awayTeam, date });
    const ok = result?.phase === 'PENALTIES' && result.confident;
    const hp = ok ? result!.homePens : null;
    const ap = ok ? result!.awayPens : null;
    await prisma.worldCupPenaltyCache.upsert({
      where: { matchId: m.matchId },
      update: { homePens: hp, awayPens: ap, checkedAt: new Date() },
      create: { matchId: m.matchId, homePens: hp, awayPens: ap },
    });
  } catch {
    /* best-effort; a later poll retries */
  } finally {
    pensInFlight.delete(m.matchId);
  }
}

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

  // For penalty matches SDB left without a shootout score (and no admin result), overlay the
  // ChatGPT display cache, and kick off a background lookup for any not cached yet.
  const pensNeeded = [...byId.values()].filter((m) => m.status === 'FINISHED' && m.phase === 'PENALTIES' && m.homePens == null);
  if (pensNeeded.length > 0) {
    const cached = await prisma.worldCupPenaltyCache.findMany({ where: { matchId: { in: pensNeeded.map((m) => m.matchId) } } }).catch(() => []);
    const cacheBy = new Map(cached.map((c) => [c.matchId, c]));
    for (const m of pensNeeded) {
      const c = cacheBy.get(m.matchId);
      if (c?.homePens != null && c.awayPens != null) {
        m.homePens = c.homePens;
        m.awayPens = c.awayPens;
      } else if (!c || Date.now() - new Date(c.checkedAt).getTime() > PENS_RETRY_MS) {
        void fillPenaltyShootout(m);
      }
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
