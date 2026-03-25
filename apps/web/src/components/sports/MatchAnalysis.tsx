'use client';

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { UP_COLOR, DOWN_COLOR, DRAW_COLOR } from '@/lib/constants';

interface H2HData {
  h2h: { total: number; homeWins: number; awayWins: number; draws: number };
  matches: Array<{ date: string; home: string; away: string; score: string }>;
  analysis: string;
}

interface Props {
  matchAnalysis: string | null | undefined;
  homeTeam: string;
  awayTeam: string;
}

export function MatchAnalysis({ matchAnalysis, homeTeam, awayTeam }: Props) {
  const data = useMemo<H2HData | null>(() => {
    if (!matchAnalysis) return null;
    try { return JSON.parse(matchAnalysis); } catch { return null; }
  }, [matchAnalysis]);

  if (!data) return null;

  const { h2h, matches, analysis } = data;
  const total = h2h.total || 1;
  const homePct = Math.round((h2h.homeWins / total) * 100);
  const drawPct = Math.round((h2h.draws / total) * 100);
  const awayPct = 100 - homePct - drawPct;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Head to Head
      </Typography>

      {/* H2H bar */}
      <Box sx={{ display: 'flex', gap: '2px', height: 24, borderRadius: '5px', overflow: 'hidden' }}>
        <Box sx={{ flex: homePct || 1, bgcolor: `${UP_COLOR}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: UP_COLOR }}>{h2h.homeWins}W</Typography>
        </Box>
        <Box sx={{ flex: drawPct || 1, bgcolor: `${DRAW_COLOR}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: DRAW_COLOR }}>{h2h.draws}D</Typography>
        </Box>
        <Box sx={{ flex: awayPct || 1, bgcolor: `${DOWN_COLOR}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: DOWN_COLOR }}>{h2h.awayWins}W</Typography>
        </Box>
      </Box>

      {/* Labels */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>{homeTeam}</Typography>
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>{h2h.total} matches</Typography>
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>{awayTeam}</Typography>
      </Box>

      {/* Recent matches */}
      {matches.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {matches.slice(0, 5).map((m, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, fontSize: '0.7rem', fontWeight: 600 }}>
              <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: 'rgba(255,255,255,0.3)', width: 70, flexShrink: 0 }}>{m.date}</Typography>
              <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: 'rgba(255,255,255,0.55)', flex: 1, textAlign: 'right' }}>{m.home}</Typography>
              <Typography sx={{ fontSize: 'inherit', fontWeight: 700, color: '#fff', width: 35, textAlign: 'center' }}>{m.score}</Typography>
              <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: 'rgba(255,255,255,0.55)', flex: 1 }}>{m.away}</Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* AI Analysis */}
      <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: '5px', p: 1.5 }}>
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
          {analysis.replace(/^#\s*.+\n?/, '')}
        </Typography>
      </Box>
    </Box>
  );
}
