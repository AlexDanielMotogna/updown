'use client';

import { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { Add, Remove, CheckCircle } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { WC_NEON_GREEN } from '@/lib/worldcup';
import type { WorldCupMatch, WorldCupPredictionDto, WorldCupPhase } from '@/lib/api';

const ROUND_LABEL: Record<string, string> = {
  '32': 'Round of 32', '16': 'Round of 16', '8': 'Quarter-final',
  '4': 'Semi-final', '3': 'Third place', '2': 'Final', '1': 'Final',
};
export const roundLabel = (r: string | null) => (r ? (ROUND_LABEL[r] ?? `Round ${r}`).toUpperCase() : 'WORLD CUP');
const PHASE_OPTS: { value: WorldCupPhase; label: string }[] = [
  { value: 'REGULATION', label: "90'" },
  { value: 'EXTRA_TIME', label: 'Extra time' },
  { value: 'PENALTIES', label: 'Penalties' },
];

export function matchDateLabel(iso: string | null): string {
  if (!iso) return 'TBD';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function Crest({ src, alt }: { src: string | null; alt: string }) {
  const t = useThemeTokens();
  return src ? <Box component="img" src={src} alt={alt} sx={{ width: 30, height: 30, objectFit: 'contain' }} />
             : <Box sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: t.hover.light }} />;
}

interface Props {
  m: WorldCupMatch;
  prediction?: WorldCupPredictionDto;
  authed: boolean;
  saving: boolean;
  onSave: (matchId: string, home: number, away: number, phase: WorldCupPhase) => void;
  onLogin: () => void;
}

export function MatchRow({ m, prediction, authed, saving, onSave, onLogin }: Props) {
  const t = useThemeTokens();
  const editable = m.status === 'SCHEDULED';

  const [home, setHome] = useState(prediction?.homeScore ?? 0);
  const [away, setAway] = useState(prediction?.awayScore ?? 0);
  const [phase, setPhase] = useState<WorldCupPhase>(prediction?.phase ?? 'REGULATION');
  useEffect(() => {
    if (prediction) { setHome(prediction.homeScore); setAway(prediction.awayScore); setPhase(prediction.phase); }
  }, [prediction]);

  const dirty = !prediction || prediction.homeScore !== home || prediction.awayScore !== away || prediction.phase !== phase;
  const clamp = (n: number) => Math.max(0, Math.min(30, n));
  const canEdit = editable && authed;

  const handleClick = () => {
    if (!editable) return;
    if (!authed) { onLogin(); return; }
    if (dirty && !saving) onSave(m.matchId, home, away, phase);
  };

  const stepBtn = (dir: -1 | 1, set: (n: number) => void, value: number) => (
    <Box
      onClick={() => canEdit && set(clamp(value + dir))}
      sx={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', bgcolor: t.hover.light, color: t.text.secondary, cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : 0.5, '&:hover': canEdit ? { bgcolor: t.hover.medium } : {} }}
    >
      {dir < 0 ? <Remove sx={{ fontSize: 17 }} /> : <Add sx={{ fontSize: 17 }} />}
    </Box>
  );

  const scoreCell = (value: number) => (
    <Box sx={{ width: 44, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', bgcolor: withAlpha('#000', 0.25), border: `1px solid ${t.border.subtle}` }}>
      <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  );

  const chromeBtn = (label: string, onClick: (() => void) | undefined, variant: 'primary' | 'saved') => (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.4,
        width: '100%', px: 1.25, py: 0.75, borderRadius: '6px', cursor: onClick ? 'pointer' : 'default',
        ...(variant === 'primary'
          ? { background: 'linear-gradient(180deg, #FBFCFD 0%, #C6CAD1 100%)', color: '#0B0F14', boxShadow: '0 1px 2px rgba(0,0,0,0.45)', '&:hover': onClick ? { filter: 'brightness(1.06)' } : {} }
          : { bgcolor: t.hover.strong, color: t.text.secondary }),
      }}
    >
      {variant === 'saved' && <CheckCircle sx={{ fontSize: 14, color: t.gain }} />}
      <Typography sx={{ fontSize: '0.76rem', fontWeight: 700 }}>{label}</Typography>
    </Box>
  );

  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', bgcolor: t.bg.surfaceAlt, borderRadius: 1.5, px: { xs: 1.5, md: 2 }, py: 1.5, border: `1px solid ${t.border.subtle}` }}>
      {m.status === 'LIVE' && (
        <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', bgcolor: WC_NEON_GREEN, boxShadow: `0 0 10px 1px ${withAlpha(WC_NEON_GREEN, 0.75)}` }} />
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 }, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
        {/* Meta */}
        <Box sx={{ width: { xs: '100%', md: 118 }, flexShrink: 0 }}>
          <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: t.text.tertiary, letterSpacing: '0.05em' }}>{roundLabel(m.round)}</Typography>
          <Typography sx={{ fontSize: '0.68rem', color: t.text.quaternary }}>{matchDateLabel(m.kickoff)}</Typography>
          {m.status === 'LIVE' && (
            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: WC_NEON_GREEN, boxShadow: `0 0 6px ${WC_NEON_GREEN}`, animation: 'wcpulse 1.2s infinite', '@keyframes wcpulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } } }} />
              <Typography sx={{ fontSize: '0.63rem', fontWeight: 800, color: WC_NEON_GREEN, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums' }}>LIVE{m.progress ? ` ${m.progress}'` : ''}</Typography>
            </Box>
          )}
        </Box>

        {/* Home */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, flex: 1, minWidth: 100 }}>
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: t.text.primary, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.homeTeam}</Typography>
          <Crest src={m.homeCrest} alt={m.homeTeam} />
        </Box>

        {/* Predictor */}
        <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0.75, width: { xs: '100%', md: 300 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              {canEdit && stepBtn(-1, setHome, home)}
              {scoreCell(canEdit ? home : (m.homeScore ?? 0))}
              {canEdit && stepBtn(1, setHome, home)}
            </Box>
            <Typography sx={{ color: t.text.tertiary, fontWeight: 700 }}>-</Typography>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              {canEdit && stepBtn(-1, setAway, away)}
              {scoreCell(canEdit ? away : (m.awayScore ?? 0))}
              {canEdit && stepBtn(1, setAway, away)}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: '4px' }}>
            {PHASE_OPTS.map((p) => {
              const active = phase === p.value;
              return (
                <Box key={p.value} onClick={() => canEdit && setPhase(p.value)} sx={{ flex: 1, py: 0.6, textAlign: 'center', cursor: canEdit ? 'pointer' : 'default', borderRadius: '5px', bgcolor: active ? withAlpha('#ffffff', 0.16) : t.hover.light, transition: 'all 0.15s', '&:hover': canEdit ? { bgcolor: active ? withAlpha('#ffffff', 0.16) : t.hover.medium } : {} }}>
                  <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: active ? t.text.primary : t.text.tertiary }}>{p.label}</Typography>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Away */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 100 }}>
          <Crest src={m.awayCrest} alt={m.awayTeam} />
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: t.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.awayTeam}</Typography>
        </Box>

        {/* Action */}
        <Box sx={{ width: { xs: '100%', md: 138 }, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          {!editable ? (
            prediction
              ? chromeBtn('Pick saved', undefined, 'saved')
              : <Typography sx={{ width: '100%', textAlign: 'center', fontSize: '0.72rem', fontWeight: 600, color: t.text.tertiary }}>{m.status === 'FINISHED' ? 'Full Time' : 'Locked'}</Typography>
          ) : prediction && !dirty ? (
            chromeBtn('Pick saved', undefined, 'saved')
          ) : (
            chromeBtn(saving ? 'Saving…' : prediction ? 'Update pick' : 'Make your pick', handleClick, 'primary')
          )}
        </Box>
      </Box>
    </Box>
  );
}
