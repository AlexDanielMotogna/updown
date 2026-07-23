'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { BoltOutlined } from '@mui/icons-material';
import { useBoosts } from '@/hooks/useBoosts';
import { useThemeTokens } from '@/app/providers';
import { UpIcon } from '@/components/UpIcon';
import type { ActiveBoostEntry, BoostKind } from '@/lib/api';

function compactLeft(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${ss}s`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${s}s`;
}

/** Distinct icon per boost kind: UP coin for COINS, lightning for XP. */
function KindIcon({ kind, color }: { kind: BoostKind; color: string }) {
  if (kind === 'COINS') return <UpIcon size={15} />;
  return <BoltOutlined sx={{ fontSize: 15, color }} />;
}

/**
 * Floating indicator for active XP/COINS boosts, pinned to a screen corner (out
 * of the navbar) with a live countdown. Renders nothing when no boost is active.
 * Its own 1s tick keeps re-renders local.
 */
export function BoostBadges() {
  const t = useThemeTokens();
  const { data } = useBoosts();
  const [now, setNow] = useState(() => Date.now());

  const active = (data?.active ?? []).filter((a) => new Date(a.expiresAt).getTime() > Date.now());

  useEffect(() => {
    if (active.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active.length]);

  if (active.length === 0) return null;

  const label = (a: ActiveBoostEntry) => `${a.multiplierBps / 10000}x ${a.kind === 'XP' ? 'XP' : 'Coins'}`;

  return (
    <Box
      sx={{
        position: 'fixed',
        left: 16,
        bottom: { xs: 76, md: 20 }, // clear the mobile bottom nav
        zIndex: 1150,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        pointerEvents: 'none',
      }}
    >
      {active.map((a) => (
        <Tooltip key={a.kind} title={`${label(a)} boost active — ${compactLeft(a.expiresAt, now)} left`} arrow placement="right">
          <Box
            sx={{
              pointerEvents: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1,
              py: 0.5,
              borderRadius: '999px',
              bgcolor: t.bg.surface,
              border: `1px solid ${t.border.subtle}`,
              boxShadow: t.surfaceShadow,
            }}
          >
            <KindIcon kind={a.kind} color={t.accent} />
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: t.text.secondary, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {compactLeft(a.expiresAt, now)}
            </Typography>
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}
