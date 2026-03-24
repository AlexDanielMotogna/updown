'use client';

import { Box, Typography } from '@mui/material';
import { UP_COLOR, DOWN_COLOR, DRAW_COLOR } from '@/lib/constants';

const SIDES = [
  { value: 'HOME', label: 'H', color: UP_COLOR },
  { value: 'DRAW', label: 'D', color: DRAW_COLOR },
  { value: 'AWAY', label: 'A', color: DOWN_COLOR },
] as const;

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
}

export function MatchdayFixtureRow({ homeTeam, awayTeam, homeTeamCrest, awayTeamCrest, selected, result, resultHome, resultAway, onSelect, disabled }: Props) {
  const isCorrect = selected && result && selected === result;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75 }}>
      {/* Home team */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: 'flex-end', minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: result === 'HOME' ? UP_COLOR : '#fff' }}>
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
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: result === 'AWAY' ? DOWN_COLOR : '#fff' }}>
          {awayTeam}
        </Typography>
      </Box>

      {/* H/D/A picker or result indicator */}
      <Box sx={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
        {SIDES.map(s => {
          const active = selected === s.value;
          const correct = result && selected === s.value && result === s.value;
          const wrong = result && selected === s.value && result !== s.value;
          return (
            <Box
              key={s.value}
              onClick={() => !disabled && onSelect?.(s.value)}
              sx={{
                width: 26, height: 26,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '4px',
                cursor: disabled ? 'default' : 'pointer',
                fontSize: '0.65rem', fontWeight: 700,
                bgcolor: correct ? `${s.color}30` : wrong ? 'rgba(248,113,113,0.15)' : active ? `${s.color}20` : 'rgba(255,255,255,0.04)',
                color: correct ? s.color : wrong ? '#F87171' : active ? s.color : 'rgba(255,255,255,0.3)',
                border: active ? `1px solid ${correct ? s.color : wrong ? '#F87171' : s.color}40` : '1px solid transparent',
                transition: 'all 0.1s',
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
