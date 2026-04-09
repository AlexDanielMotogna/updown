'use client';

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface H2HData {
  h2h: { total: number; homeWins: number; awayWins: number; draws: number };
  matches: Array<{ date: string; home: string; away: string; score: string }>;
  analysis: string;
}

interface Props {
  matchAnalysis: string | null | undefined;
  homeTeam: string;
  awayTeam: string;
  numSides?: number;
}

export function MatchAnalysis({ matchAnalysis, homeTeam, awayTeam, numSides = 3 }: Props) {
  const t = useThemeTokens();

  const data = useMemo<H2HData | null>(() => {
    if (!matchAnalysis) return null;
    try { return JSON.parse(matchAnalysis); } catch { return null; }
  }, [matchAnalysis]);

  if (!data) return null;

  const { h2h, matches, analysis } = data;
  const total = h2h.total || 1;
  const showDraw = numSides >= 3 && h2h.draws > 0;
  const homePct = Math.round((h2h.homeWins / total) * 100);
  const drawPct = showDraw ? Math.round((h2h.draws / total) * 100) : 0;
  const awayPct = 100 - homePct - drawPct;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Head to Head
      </Typography>

      {/* H2H bar */}
      <Box sx={{ display: 'flex', gap: '2px', height: 24, borderRadius: '5px', overflow: 'hidden' }}>
        <Box sx={{ flex: homePct || 1, bgcolor: withAlpha(t.up, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: t.up }}>{h2h.homeWins}W</Typography>
        </Box>
        {showDraw && (
          <Box sx={{ flex: drawPct || 1, bgcolor: withAlpha(t.draw, 0.13), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: t.draw }}>{h2h.draws}D</Typography>
          </Box>
        )}
        <Box sx={{ flex: awayPct || 1, bgcolor: withAlpha(t.down, 0.13), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: t.down }}>{h2h.awayWins}W</Typography>
        </Box>
      </Box>

      {/* Labels */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: t.text.soft }}>{homeTeam}</Typography>
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: t.text.quaternary }}>{h2h.total} matches</Typography>
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: t.text.soft }}>{awayTeam}</Typography>
      </Box>

      {/* Recent matches */}
      {matches.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {matches.slice(0, 5).map((m, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, fontSize: '0.7rem', fontWeight: 600 }}>
              <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: t.text.dimmed, width: 70, flexShrink: 0 }}>{m.date}</Typography>
              <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: t.text.strong, flex: 1, textAlign: 'right' }}>{m.home}</Typography>
              <Typography sx={{ fontSize: 'inherit', fontWeight: 700, color: t.text.primary, width: 35, textAlign: 'center' }}>{m.score}</Typography>
              <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: t.text.strong, flex: 1 }}>{m.away}</Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* AI Analysis */}
      <Box sx={{ bgcolor: t.hover.light, borderRadius: '5px', p: 1.5 }}>
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
          {analysis.replace(/^#\s*.+\n?/, '')}
        </Typography>
      </Box>
    </Box>
  );
}
