import { useState, useEffect } from 'react';

export interface LiveScore {
  eventId: string;
  homeScore: number;
  awayScore: number;
  status: string;
  progress: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  homeTeamBadge: string;
  awayTeamBadge: string;
  updatedAt: number;
}

/**
 * TheSportsDB Event Status Codes - complete reference
 *
 * FINISHED (game over, show final score):
 *   FT   - Full Time
 *   AET  - After Extra Time
 *   PEN  - After Penalties (soccer)
 *   AOT  - After Overtime
 *   AP   - After Penalties (hockey/handball)
 *
 * IN-PLAY (game active):
 *   Soccer:     1H, HT, 2H, ET, P, BT
 *   Basketball: Q1, Q2, Q3, Q4, OT, BT, HT
 *   Ice Hockey: P1, P2, P3, OT, PT, BT
 *   Am.Football:Q1, Q2, Q3, Q4, OT, HT
 *   Baseball:   IN1-IN9
 *   Volleyball: S1-S5
 *   Handball:   1H, 2H, HT, ET, BT, PT
 *   Rugby:      1H, 2H, HT, ET, BT, PT
 *
 * INACTIVE (cancelled/postponed - no score):
 *   NS, TBD, PST, POST, CANC, ABD, AWD, AW, WO, SUSP, INT, INTR
 */

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'AOT', 'AP']);

/** True when the livescore is for an actively-playing match (not finished, not NS) */
export function isMatchActive(score: LiveScore | null | undefined): boolean {
  if (!score) return false;
  return !FINISHED_STATUSES.has(score.status) && score.status !== 'NS' && score.status !== 'TBD';
}

/** True when the livescore indicates the match has ended */
export function isMatchFinished(status: string): boolean {
  return FINISHED_STATUSES.has(status);
}

/** Human-readable label for TheSportsDB status codes */
const STATUS_LABELS: Record<string, string> = {
  // Phase D belt-and-suspenders: when only Odds API has the event (rare -
  // a league SDB doesn't cover), the poller writes status='LIVE' with no
  // progress. Without this entry the match page would render the stutter
  // "LIVE · LIVE". 'In Play' reads cleanly alongside the existing prefix.
  'LIVE': 'In Play',
  // Soccer
  'TBD': 'TBD', 'NS': 'Not Started',
  '1H': '1st Half', 'HT': 'HT Break', '2H': '2nd Half',
  'ET': 'Extra Time', 'P': 'Penalties', 'BT': 'Break',
  'FT': 'Full Time', 'AET': 'After Extra Time', 'PEN': 'After Penalties',
  'SUSP': 'Suspended', 'INT': 'Interrupted',
  'PST': 'Postponed', 'POST': 'Postponed',
  'CANC': 'Cancelled', 'ABD': 'Abandoned',
  'AWD': 'Awarded', 'AW': 'Awarded', 'WO': 'Walkover',
  // Basketball / Am. Football
  'Q1': '1st Qtr', 'Q2': '2nd Qtr', 'Q3': '3rd Qtr', 'Q4': '4th Qtr',
  'OT': 'Overtime', 'AOT': 'After OT',
  // Ice Hockey
  'P1': '1st Period', 'P2': '2nd Period', 'P3': '3rd Period',
  'PT': 'Penalties', 'AP': 'After Penalties', 'SO': 'Shootout',
  'INTR': 'Interrupted',
  // Baseball
  'IN1': '1st Inning', 'IN2': '2nd Inning', 'IN3': '3rd Inning',
  'IN4': '4th Inning', 'IN5': '5th Inning', 'IN6': '6th Inning',
  'IN7': '7th Inning', 'IN8': '8th Inning', 'IN9': '9th Inning',
  // Volleyball
  'S1': 'Set 1', 'S2': 'Set 2', 'S3': 'Set 3', 'S4': 'Set 4', 'S5': 'Set 5',
};

/** Statuses where progress minutes should NOT be appended */
const NO_PROGRESS_STATUSES = new Set([
  ...FINISHED_STATUSES, 'HT', 'BT', 'NS', 'TBD',
  'PST', 'POST', 'CANC', 'ABD', 'AWD', 'AW', 'WO', 'SUSP', 'INT', 'INTR',
  // Generic 'LIVE' has no meaningful minute (Phase D - see STATUS_LABELS).
  'LIVE',
]);

export function formatLiveStatus(status: string, progress?: string): string {
  const label = STATUS_LABELS[status] || status;
  // Only append progress when it's actually a soccer-style minute number
  // ("45", "67+2"). Inning / quarter / period / set codes (IN2, Q3, P2,
  // S1) come back from the feed with progress === status which used to
  // render as the redundant "2nd Inning IN2'" string. Anything that
  // doesn't start with a digit is treated as a non-minute progress field
  // and dropped here rather than maintained as another exclusion list.
  if (
    progress &&
    !NO_PROGRESS_STATUSES.has(status) &&
    /^\d/.test(progress) &&
    progress !== status
  ) {
    return `${label} ${progress}'`;
  }
  return label;
}

// ─── Phase B (PLAN-LIVESCORE-SOURCE-SPLIT) ─────────────────────────────────
// Wall-clock duration after which a match is "expected to be over". Mirrors
// the backend's EXPECTED_MATCH_DURATION_MS in `livescore/types.ts`. Used by
// the "Awaiting result" UI state - when the pool is past this window but the
// livescore feed still hasn't marked it FT/AET/PEN, we show a placeholder
// instead of pretending the match is still live. For knockout leagues
// (CL, EL) we leave the window long enough to cover extra time + penalties.
const EXPECTED_MATCH_DURATION_MS: Record<string, number> = {
  // Soccer regular season - 90 reg + 15 break + 10 stoppage buffer
  BSA: 115 * 60_000, PL: 115 * 60_000, PD: 115 * 60_000, SA: 115 * 60_000,
  BL1: 115 * 60_000, FL1: 115 * 60_000, ELC: 115 * 60_000,
  DED: 115 * 60_000, PPL: 115 * 60_000,
  // Soccer knockouts - allow ET + pens
  CL: 155 * 60_000, EL: 155 * 60_000,
  // US sports - timeouts/commercials inflate wall time
  NBA: 150 * 60_000, NHL: 150 * 60_000, NFL: 210 * 60_000,
  MMA: 180 * 60_000, MLB: 210 * 60_000,
};
const DEFAULT_EXPECTED_DURATION_MS = 120 * 60_000;

function expectedMatchEndMs(kickoff: string | Date, league: string | null | undefined): number {
  const ms = typeof kickoff === 'string' ? Date.parse(kickoff) : kickoff.getTime();
  const dur = (league ? EXPECTED_MATCH_DURATION_MS[league] : undefined) ?? DEFAULT_EXPECTED_DURATION_MS;
  return ms + dur;
}

/**
 * True when the pool's match should be over by wall-clock time but the
 * livescore feed hasn't yet flagged FT/AET/PEN and the pool hasn't resolved.
 *
 * Drives the "Awaiting result" placeholder on the match page and the badge
 * on MarketCard. Backend's `pollOddsApiFallback` uses the same window
 * (kickoff + expectedDuration + 5min grace) before falling back to The Odds
 * API's `completed:true` signal for non-knockout leagues.
 */
export function isAwaitingFinalResult(
  pool: { startTime: string | Date; status: string; league?: string | null } | null | undefined,
  liveScoreStatus?: string,
): boolean {
  if (!pool) return false;
  // Already done one way or the other.
  if (pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE' || pool.status === 'CANCELLED') return false;
  // Feed already says finished - handled by the existing `matchFinished` path.
  if (liveScoreStatus && FINISHED_STATUSES.has(liveScoreStatus)) return false;
  // Feed is actively reporting an in-play status (1H/2H/HT/ET…) - the match is
  // still going (e.g. stoppage time at 90+3), so it's NOT "awaiting the final
  // whistle". Without this guard the expected-end clock fired during stoppage
  // and the header showed "Full Time" while the match was still live.
  if (liveScoreStatus && liveScoreStatus !== 'NS' && liveScoreStatus !== 'TBD') return false;
  // No live status / feed went silent past expected end → awaiting.
  return Date.now() > expectedMatchEndMs(pool.startTime, pool.league);
}

const API = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002')
  : '';

/**
 * Poll all livescores every 30s.
 * Returns a Map<matchId, LiveScore> for quick lookup.
 */
export function useLiveScores() {
  const [scores, setScores] = useState<Map<string, LiveScore>>(new Map());

  useEffect(() => {
    const fetchScores = async () => {
      try {
        const res = await fetch(`${API}/api/pools/livescores`);
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          const map = new Map<string, LiveScore>();
          for (const s of data.data) {
            // Key by eventId ONLY. The previous codepath ALSO indexed by
            // a normalised homeTeam ("manchesterunited") as a fallback for
            // football pools whose matchId came from football-data.org
            // and didn't line up with the SDB eventId - but that fallback
            // had the exact same cross-day collision bug as the backend
            // odds-api gap-fill (2026-06-03 Rays/Tigers incident): when
            // the same team plays back-to-back days, the second day's
            // entry silently overwrote the first, and pool cards rendered
            // with whichever score happened to land last. Football pools
            // need a real cross-ID mapping at ingest, not a name-based
            // fallback here.
            map.set(s.eventId, s);
          }
          setScores(map);
        }
      } catch { /* silent */ }
    };

    fetchScores();
    const iv = setInterval(fetchScores, 60_000);
    return () => clearInterval(iv);
  }, []);

  return scores;
}

/**
 * Get livescore for a single pool.
 */
export function useLiveScore(poolId: string | null) {
  const [score, setScore] = useState<LiveScore | null>(null);

  useEffect(() => {
    if (!poolId) return;

    const fetchScore = async () => {
      try {
        const res = await fetch(`${API}/api/pools/${poolId}/livescore`);
        const data = await res.json();
        if (data.success) setScore(data.data);
      } catch { /* silent */ }
    };

    fetchScore();
    const iv = setInterval(fetchScore, 60_000);
    return () => clearInterval(iv);
  }, [poolId]);

  return score;
}
