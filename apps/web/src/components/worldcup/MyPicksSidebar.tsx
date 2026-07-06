'use client';

import { useState } from 'react';
import { Box, Typography, Collapse } from '@mui/material';
import { ExpandLess, ExpandMore, Schedule } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { WC_NEON_GREEN } from '@/lib/worldcup';
import type { WorldCupMatch, WorldCupPredictionDto } from '@/lib/api';
import { roundLabel, matchDateLabel } from './MatchRow';

const PHASE_TAG: Record<string, string> = { REGULATION: "90'", EXTRA_TIME: 'AET', PENALTIES: 'Penalties' };

function Crest({ src }: { src: string | null }) {
  const t = useThemeTokens();
  return src ? <Box component="img" src={src} alt="" sx={{ width: 22, height: 22, objectFit: 'contain' }} />
             : <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: t.hover.light }} />;
}

interface Props {
  matches: WorldCupMatch[];
  predByMatch: Map<string, WorldCupPredictionDto>;
}

export function MyPicksSidebar({ matches, predByMatch }: Props) {
  const t = useThemeTokens();
  const [open, setOpen] = useState(true);
  const pickedCount = matches.filter((m) => predByMatch.has(m.matchId)).length;

  return (
    <Box sx={{ bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 2, p: 2 }}>
      <Box onClick={() => setOpen((v) => !v)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: t.text.primary }}>My Picks</Typography>
          <Box sx={{ px: 0.8, py: 0.1, borderRadius: '999px', bgcolor: t.hover.light }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: t.text.secondary }}>{pickedCount}/{matches.length}</Typography>
          </Box>
        </Box>
        {open ? <ExpandLess sx={{ color: t.text.tertiary }} /> : <ExpandMore sx={{ color: t.text.tertiary }} />}
      </Box>

      <Collapse in={open}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1.5 }}>
          {matches.map((m) => {
            const p = predByMatch.get(m.matchId);
            return (
              <Box key={m.matchId} sx={{ p: 1.25, borderRadius: 1.5, bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {m.status === 'LIVE'
                      ? <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: WC_NEON_GREEN, boxShadow: `0 0 5px ${WC_NEON_GREEN}` }} />
                      : <Schedule sx={{ fontSize: 13, color: t.text.quaternary }} />}
                    <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: t.text.tertiary, letterSpacing: '0.05em' }}>{roundLabel(m.round)}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.64rem', color: t.text.quaternary }}>{matchDateLabel(m.kickoff)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Crest src={m.homeCrest} />
                  <Typography sx={{ flex: 1, fontSize: '0.8rem', fontWeight: 700, color: t.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.homeTeam}</Typography>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: p ? t.text.primary : t.text.quaternary, fontVariantNumeric: 'tabular-nums' }}>
                    {p ? `${p.homeScore} - ${p.awayScore}` : '— —'}
                  </Typography>
                  <Typography sx={{ flex: 1, fontSize: '0.8rem', fontWeight: 700, color: t.text.primary, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.awayTeam}</Typography>
                  <Crest src={m.awayCrest} />
                </Box>
                {p && (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.75 }}>
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: t.gain }}>✓ Pick saved</Typography>
                    <Box sx={{ px: 0.6, py: 0.1, borderRadius: '4px', bgcolor: withAlpha(t.gold, 0.15) }}>
                      <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: t.gold }}>{PHASE_TAG[p.phase]}</Typography>
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
        <Typography sx={{ fontSize: '0.68rem', color: t.text.quaternary, textAlign: 'center', mt: 1.5 }}>
          You can change your picks until kickoff
        </Typography>
      </Collapse>
    </Box>
  );
}
