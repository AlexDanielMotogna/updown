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
 * TheSportsDB Event Status Codes — complete reference
 *
 * FINISHED (game over, show final score):
 *   FT   — Full Time
 *   AET  — After Extra Time
 *   PEN  — After Penalties (soccer)
 *   AOT  — After Overtime
 *   AP   — After Penalties (hockey/handball)
 *
 * IN-PLAY (game active):
 *   Soccer:     1H, HT, 2H, ET, P, BT
 *   Basketball: Q1, Q2, Q3, Q4, OT, BT, HT
 *   Ice Hockey: P1, P2, P3, OT, PT, BT
 *   Am.Football:Q1, Q2, Q3, Q4, OT, HT
 *   Baseball:   IN1–IN9
 *   Volleyball: S1–S5
 *   Handball:   1H, 2H, HT, ET, BT, PT
 *   Rugby:      1H, 2H, HT, ET, BT, PT
 *
 * INACTIVE (cancelled/postponed — no score):
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
]);

export function formatLiveStatus(status: string, progress?: string): string {
  const label = STATUS_LABELS[status] || status;
  if (progress && !NO_PROGRESS_STATUSES.has(status)) {
    return `${label} ${progress}'`;
  }
  return label;
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
            // Key by eventId (matches TheSportsDB pools: NBA, NHL, NFL, MMA)
            map.set(s.eventId, s);
            // Also key by normalized homeTeam (fallback for football pools)
            if (s.homeTeam) {
              map.set(s.homeTeam.toLowerCase().replace(/[^a-z0-9]/g, ''), s);
            }
          }
          setScores(map);
        }
      } catch { /* silent */ }
    };

    fetchScores();
    const iv = setInterval(fetchScores, 30_000);
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
    const iv = setInterval(fetchScore, 30_000);
    return () => clearInterval(iv);
  }, [poolId]);

  return score;
}
