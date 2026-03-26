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
            // Also key by normalized homeTeam (matches football pools with football-data.org IDs)
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
