'use client';

import { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { Add, Remove, CheckCircle, KeyboardArrowDown, SportsSoccer } from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { WC_NEON_GREEN } from '@/lib/worldcup';
import { fetchWorldCupTimeline } from '@/lib/api';
import type { WorldCupMatch, WorldCupPredictionDto, WorldCupPhase, WorldCupGoal } from '@/lib/api';

// The API already returns a normalized round label (e.g. "Round of 16").
export const roundLabel = (r: string | null) => (r ? r.toUpperCase() : 'WORLD CUP');
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

function GoalLine({ g }: { g: WorldCupGoal }) {
  const t = useThemeTokens();
  const tag = g.kind === 'PENALTY' ? ' (P)' : g.kind === 'OWN_GOAL' ? ' (OG)' : '';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
      <SportsSoccer sx={{ fontSize: 13, color: t.text.tertiary, flexShrink: 0 }} />
      <Typography sx={{ fontSize: '0.78rem', color: t.text.secondary }}>
        <Box component="span" sx={{ fontWeight: 700, color: t.text.primary }}>{g.minute != null ? `${g.minute}'` : ''}</Box> {g.player}{tag}
      </Typography>
    </Box>
  );
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

  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const timelineOpts = {
    queryKey: ['wc-timeline', m.matchId] as const,
    queryFn: () => fetchWorldCupTimeline(m.matchId),
    // Finished games never change, so keep them cached forever (no reload on reopen).
    staleTime: m.status === 'FINISHED' ? Infinity : 30_000,
    gcTime: 10 * 60_000,
  };
  // Live matches show their goals open automatically; finished matches show them behind a chevron.
  const goalsShown = m.status === 'LIVE' || (open && m.status === 'FINISHED');
  const { data: goalsRes, isLoading: goalsLoading } = useQuery({
    ...timelineOpts,
    enabled: goalsShown,
    refetchInterval: m.status === 'LIVE' ? 30_000 : false,
  });
  const goals = goalsRes?.data ?? [];
  const prefetchGoals = () => { if (m.status === 'FINISHED') void queryClient.prefetchQuery(timelineOpts); };

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
    <Box sx={{ bgcolor: t.bg.surfaceAlt, borderRadius: 1.5, px: { xs: 1.5, md: 2 }, py: { xs: 1.75, md: 2.25 }, border: `1px solid ${t.border.subtle}` }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 }, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
        {/* Meta */}
        <Box sx={{ width: { xs: '100%', md: 118 }, flexShrink: 0 }}>
          <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: t.text.tertiary, letterSpacing: '0.05em' }}>{roundLabel(m.round)}</Typography>
          <Typography sx={{ fontSize: '0.68rem', color: t.text.quaternary }}>{matchDateLabel(m.kickoff)}</Typography>
        </Box>

        {/* Home */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, flex: 1, minWidth: 100 }}>
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: t.text.primary, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.homeTeam}</Typography>
          <Crest src={m.homeCrest} alt={m.homeTeam} />
        </Box>

        {/* Predictor */}
        <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1.1, width: { xs: '100%', md: 300 } }}>
          {m.status === 'LIVE' && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.6 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: WC_NEON_GREEN, boxShadow: `0 0 6px ${WC_NEON_GREEN}`, animation: 'wcpulse 1.2s infinite', '@keyframes wcpulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } } }} />
              <Typography sx={{ fontSize: '0.66rem', fontWeight: 800, color: WC_NEON_GREEN, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums' }}>LIVE{m.progress ? ` ${m.progress}'` : ''}</Typography>
            </Box>
          )}
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
          {canEdit ? (
            <Box sx={{ display: 'flex', gap: '4px' }}>
              {PHASE_OPTS.map((p) => {
                const active = phase === p.value;
                return (
                  <Box key={p.value} onClick={() => setPhase(p.value)} sx={{ flex: 1, py: 0.6, textAlign: 'center', cursor: 'pointer', borderRadius: '5px', bgcolor: active ? withAlpha('#ffffff', 0.16) : t.hover.light, transition: 'all 0.15s', '&:hover': { bgcolor: active ? withAlpha('#ffffff', 0.16) : t.hover.medium } }}>
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: active ? t.text.primary : t.text.tertiary }}>{p.label}</Typography>
                  </Box>
                );
              })}
            </Box>
          ) : m.status === 'FINISHED' ? (
            <Typography sx={{ textAlign: 'center', fontSize: '0.68rem', fontWeight: 700, color: t.text.tertiary }}>
              {m.phase === 'PENALTIES'
                ? m.homePens != null && m.awayPens != null ? `Penalties ${m.homePens}-${m.awayPens}` : 'Decided on penalties'
                : m.phase === 'EXTRA_TIME' ? 'After extra time' : 'Full Time'}
            </Typography>
          ) : null}
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
              : m.status === 'FINISHED'
                ? <Typography sx={{ width: '100%', textAlign: 'center', fontSize: '0.72rem', fontWeight: 600, color: t.text.quaternary }}>No prediction</Typography>
                : null
          ) : prediction && !dirty ? (
            chromeBtn('Pick saved', undefined, 'saved')
          ) : (
            chromeBtn(saving ? 'Saving…' : prediction ? 'Update pick' : 'Make your pick', handleClick, 'primary')
          )}
        </Box>

        {m.status === 'FINISHED' && (
          <Box onClick={() => setOpen((o) => !o)} onMouseEnter={prefetchGoals} title="Goals" sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', cursor: 'pointer', color: t.text.tertiary, '&:hover': { color: t.text.secondary } }}>
            <KeyboardArrowDown sx={{ fontSize: 20, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </Box>
        )}
      </Box>

      {goalsShown && (
        <Box sx={{ mt: 1.25, pt: 1.25, borderTop: `1px solid ${t.border.subtle}` }}>
          {goalsLoading ? (
            <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary, textAlign: 'center' }}>Loading goals…</Typography>
          ) : goals.length === 0 ? (
            <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary, textAlign: 'center' }}>No goals</Typography>
          ) : (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
                {goals.filter((g) => g.side === 'home').map((g, i) => <GoalLine key={i} g={g} />)}
              </Box>
              <Box sx={{ width: '1px', bgcolor: t.border.subtle, flexShrink: 0 }} />
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-end', minWidth: 0 }}>
                {goals.filter((g) => g.side === 'away').map((g, i) => <GoalLine key={i} g={g} />)}
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
