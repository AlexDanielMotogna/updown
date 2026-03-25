'use client';

import { Box, Typography } from '@mui/material';
import { UP_COLOR, DOWN_COLOR, DRAW_COLOR } from '@/lib/constants';

const SIDE_COLORS: Record<string, string> = {
  HOME: UP_COLOR,
  DRAW: DRAW_COLOR,
  AWAY: DOWN_COLOR,
};

interface Props {
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest?: string | null;
  awayTeamCrest?: string | null;
  selected?: string | null;
  result?: string | null;
  resultHome?: number | null;
  resultAway?: number | null;
  onSelect?: (value: string) => void;
  disabled?: boolean;
  sideLabels?: string[];
}

export function MatchdayFixtureRow({ homeTeam, awayTeam, homeTeamCrest, awayTeamCrest, selected, result, resultHome, resultAway, onSelect, disabled, sideLabels = ['Home', 'Draw', 'Away'] }: Props) {
  const isCorrect = selected && result && selected === result;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75 }}>
      {/* Home team */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: 'flex-end', minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: result === 'HOME' ? UP_COLOR : 'rgba(255,255,255,0.9)' }}>
          {homeTeam}
        </Typography>
        {homeTeamCrest && <Box component="img" src={homeTeamCrest} alt="" sx={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />}
      </Box>

      {/* Score or vs */}
      {resultHome != null && resultAway != null ? (
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff', width: 32, textAlign: 'center', flexShrink: 0 }}>
          {resultHome}-{resultAway}
        </Typography>
      ) : (
        <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.15)', width: 32, textAlign: 'center', flexShrink: 0 }}>vs</Typography>
      )}

      {/* Away team */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        {awayTeamCrest && <Box component="img" src={awayTeamCrest} alt="" sx={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />}
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: result === 'AWAY' ? DOWN_COLOR : 'rgba(255,255,255,0.9)' }}>
          {awayTeam}
        </Typography>
      </Box>

      {/* Team picker buttons */}
      <Box sx={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
        {sideLabels.map(sl => {
          const key = sl.toUpperCase();
          return {
            value: key,
            label: key === 'HOME' ? (homeTeam.length > 5 ? homeTeam.slice(0, 3).toUpperCase() : homeTeam)
              : key === 'AWAY' ? (awayTeam.length > 5 ? awayTeam.slice(0, 3).toUpperCase() : awayTeam)
              : sl,
            color: SIDE_COLORS[key] || DRAW_COLOR,
          };
        }).map(s => {
          const active = selected === s.value;
          const correct = result && selected === s.value && result === s.value;
          const wrong = result && selected === s.value && result !== s.value;
          return (
            <Box
              key={s.value}
              onClick={() => !disabled && onSelect?.(s.value)}
              sx={{
                px: 0.75, height: 26, minWidth: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '4px',
                cursor: disabled ? 'default' : 'pointer',
                fontSize: '0.6rem', fontWeight: 700,
                bgcolor: correct ? `${s.color}30` : wrong ? 'rgba(248,113,113,0.15)' : active ? `${s.color}20` : 'rgba(255,255,255,0.04)',
                color: correct ? s.color : wrong ? '#F87171' : active ? s.color : 'rgba(255,255,255,0.4)',
                border: active ? `1px solid ${correct ? s.color : wrong ? '#F87171' : s.color}40` : '1px solid transparent',
                transition: 'all 0.1s',
                whiteSpace: 'nowrap',
                ...(!disabled && { '&:hover': { bgcolor: `${s.color}15`, color: s.color } }),
              }}
            >
              {s.label}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
