'use client';

import { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { Add, Remove, CheckCircle, SportsSoccer } from '@mui/icons-material';
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
  return src ? <Box component="img" src={src} alt={alt} sx={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
             : <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: t.hover.light, flexShrink: 0 }} />;
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
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, minWidth: 0 }}>
      <SportsSoccer sx={{ fontSize: 13, color: t.text.tertiary, flexShrink: 0 }} />
      <Typography sx={{ fontSize: '0.78rem', color: t.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
    // Finished timelines rarely change, but SDB can populate scorers late, so re-validate
    // occasionally (not Infinity) to pick up a completed timeline.
    staleTime: m.status === 'FINISHED' ? 3 * 60_000 : 30_000,
    gcTime: 10 * 60_000,
  };
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

  const nameSx = (align: 'left' | 'right') => ({ fontSize: '0.9rem', fontWeight: 700, color: t.text.primary, textAlign: align, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const);

  const stepBtn = (dir: -1 | 1, set: (n: number) => void, value: number) => (
    <Box
      onClick={() => canEdit && set(clamp(value + dir))}
      sx={{ width: 28, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', bgcolor: t.hover.light, color: t.text.secondary, cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : 0.5, '&:hover': canEdit ? { bgcolor: t.hover.medium } : {} }}
    >
      {dir < 0 ? <Remove sx={{ fontSize: 16 }} /> : <Add sx={{ fontSize: 16 }} />}
    </Box>
  );

  const scoreCell = (value: number) => (
    <Box sx={{ width: 40, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', bgcolor: withAlpha('#000', 0.25), border: `1px solid ${t.border.subtle}` }}>
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

  // ---- Shared building blocks (reused by both the desktop row and the mobile card) ----
  const liveIndicator = m.status === 'LIVE' ? (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flexShrink: 0 }}>
      <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: WC_NEON_GREEN, boxShadow: `0 0 6px ${WC_NEON_GREEN}`, animation: 'wcpulse 1.2s infinite', '@keyframes wcpulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } } }} />
      <Typography sx={{ fontSize: '0.66rem', fontWeight: 800, color: WC_NEON_GREEN, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums' }}>LIVE{m.progress ? ` ${m.progress}'` : ''}</Typography>
    </Box>
  ) : null;

  const scoreControls = (
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
  );

  const phaseOrLabel = canEdit ? (
    <Box sx={{ display: 'flex', gap: '4px' }}>
      {PHASE_OPTS.map((p) => {
        const active = phase === p.value;
        return (
          <Box key={p.value} onClick={() => setPhase(p.value)} sx={{ flex: 1, minWidth: 0, py: 0.6, textAlign: 'center', cursor: 'pointer', borderRadius: '5px', bgcolor: active ? withAlpha('#ffffff', 0.16) : t.hover.light, transition: 'all 0.15s', '&:hover': { bgcolor: active ? withAlpha('#ffffff', 0.16) : t.hover.medium } }}>
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
  ) : null;

  const actionEl = !editable ? (
    prediction
      ? chromeBtn('Pick saved', undefined, 'saved')
      : m.status === 'FINISHED'
        ? <Typography sx={{ width: '100%', textAlign: 'center', fontSize: '0.72rem', fontWeight: 600, color: t.text.quaternary }}>No prediction</Typography>
        : null
  ) : prediction && !dirty ? (
    chromeBtn('Pick saved', undefined, 'saved')
  ) : (
    chromeBtn(saving ? 'Saving…' : prediction ? 'Update pick' : 'Make your pick', handleClick, 'primary')
  );

  const goalsToggle = m.status === 'FINISHED' ? (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
      <Box onClick={() => setOpen((o) => !o)} onMouseEnter={prefetchGoals} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.25, py: 0.4, borderRadius: '999px', cursor: 'pointer', color: t.text.tertiary, transition: 'all 0.15s', '&:hover': { color: t.text.secondary, bgcolor: t.hover.light } }}>
        <SportsSoccer sx={{ fontSize: 15 }} />
        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.03em' }}>{open ? 'Hide goals' : 'Goals'}</Typography>
      </Box>
    </Box>
  ) : null;

  return (
    <Box sx={{ bgcolor: t.bg.surfaceAlt, borderRadius: 1.5, px: { xs: 1.5, md: 2 }, py: { xs: 1.5, md: 2.25 }, border: `1px solid ${t.border.subtle}`, overflow: 'hidden' }}>
      {/* Desktop: single horizontal row */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 2 }}>
        <Box sx={{ width: 118, flexShrink: 0 }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: t.text.tertiary }}>{matchDateLabel(m.kickoff)}</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
          <Typography sx={nameSx('right')}>{m.homeTeam}</Typography>
          <Crest src={m.homeCrest} alt={m.homeTeam} />
        </Box>
        <Box sx={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1.1 }}>
          {liveIndicator && <Box sx={{ display: 'flex', justifyContent: 'center' }}>{liveIndicator}</Box>}
          {scoreControls}
          {phaseOrLabel}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Crest src={m.awayCrest} alt={m.awayTeam} />
          <Typography sx={nameSx('left')}>{m.awayTeam}</Typography>
        </Box>
        <Box sx={{ width: 138, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{actionEl}</Box>
      </Box>

      {/* Mobile: stacked card */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: t.text.tertiary }}>{matchDateLabel(m.kickoff)}</Typography>
          {liveIndicator}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Crest src={m.homeCrest} alt={m.homeTeam} />
            <Typography sx={nameSx('left')}>{m.homeTeam}</Typography>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
            <Typography sx={nameSx('right')}>{m.awayTeam}</Typography>
            <Crest src={m.awayCrest} alt={m.awayTeam} />
          </Box>
        </Box>
        {scoreControls}
        {phaseOrLabel}
        {actionEl && <Box>{actionEl}</Box>}
      </Box>

      {goalsToggle}

      {goalsShown && (
        <Box sx={{ mt: 1.25, pt: 1.25, borderTop: `1px solid ${t.border.subtle}` }}>
          {goalsLoading ? (
            <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary, textAlign: 'center' }}>Loading goals…</Typography>
          ) : goals.length === 0 ? (
            <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary, textAlign: 'center' }}>{m.status === 'LIVE' ? 'No goals yet' : 'No goals'}</Typography>
          ) : (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {goals.filter((g) => g.side === 'home').map((g, i) => <GoalLine key={i} g={g} />)}
              </Box>
              <Box sx={{ width: '1px', bgcolor: t.border.subtle, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-end' }}>
                {goals.filter((g) => g.side === 'away').map((g, i) => <GoalLine key={i} g={g} />)}
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
