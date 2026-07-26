'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Typography } from '@mui/material';
import { CalendarMonth, RocketLaunch, Bolt, EmojiEvents, CheckCircle } from '@mui/icons-material';
import { fetchCryptoLeaderboard, fetchCryptoActivity, type CryptoActivityRow } from '@/lib/api';
import { useThemeTokens } from '@/app/providers';

const CYAN = '#5FD8EF';

function Card({ icon, title, children, tokens: t }: { icon: React.ReactNode; title: string; children: React.ReactNode; tokens: ReturnType<typeof useThemeTokens> }) {
  return (
    <Box sx={{ borderRadius: 1, bgcolor: t.bg.surface, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: 1.5, borderBottom: `1px solid ${t.border.subtle}`, color: CYAN }}>
        {icon}
        <Typography sx={{ fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em', color: t.text.primary }}>{title}</Typography>
      </Box>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Box>
  );
}

/** Countdown to next Monday 00:00 UTC (weekly reset), as "Xd Yh Zm". */
function timeToWeeklyReset(now: number): string {
  const d = new Date(now);
  const day = d.getUTCDay();
  const days = day === 0 ? 1 : 8 - day; // to next Monday
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days);
  let ms = next - now;
  if (ms < 0) ms = 0;
  const dd = Math.floor(ms / 86_400_000);
  const hh = Math.floor((ms % 86_400_000) / 3_600_000);
  const mm = Math.floor((ms % 3_600_000) / 60_000);
  return `${dd}d ${hh}h ${mm}m`;
}

export function EventInfoCard() {
  const t = useThemeTokens();
  const { data } = useQuery({ queryKey: ['crypto-leaderboard', 'week'], queryFn: () => fetchCryptoLeaderboard('week'), refetchInterval: 20_000 });
  const participants = data?.data?.length ?? 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);

  const stat = (label: string, value: string, color?: string) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.6 }}>
      <Typography sx={{ fontSize: '0.8rem', color: t.text.secondary }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: color ?? t.text.primary }}>{value}</Typography>
    </Box>
  );

  return (
    <Card icon={<CalendarMonth sx={{ fontSize: 18 }} />} title="EVENT INFO" tokens={t}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
        <EmojiEvents sx={{ fontSize: 18, color: t.gold, mt: '2px' }} />
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: t.text.primary }}>Weekly $100 Prize</Typography>
          <Typography sx={{ fontSize: '0.76rem', color: t.text.secondary, lineHeight: 1.45 }}>Top the weekly PNL leaderboard and win $100. Resets every Monday.</Typography>
        </Box>
      </Box>
      {stat('Prize Pool', '$100.00', t.gain)}
      {stat('Time Left', timeToWeeklyReset(now))}
      {stat('Participants', participants.toLocaleString())}
    </Card>
  );
}

export function AboutEventCard() {
  const t = useThemeTokens();
  const items = ['5-minute prediction window', 'UP or DOWN', 'Instant results', 'Real payouts'];
  return (
    <Card icon={<RocketLaunch sx={{ fontSize: 18 }} />} title="ABOUT THIS EVENT" tokens={t}>
      <Typography sx={{ fontSize: '0.8rem', color: t.text.secondary, lineHeight: 1.55, mb: 1.5 }}>
        Make UP or DOWN predictions on crypto prices in 5-minute intervals. Fast. Simple. Transparent.
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map((it) => (
          <Box key={it} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircle sx={{ fontSize: 16, color: CYAN }} />
            <Typography sx={{ fontSize: '0.8rem', color: t.text.primary }}>{it}</Typography>
          </Box>
        ))}
      </Box>
    </Card>
  );
}

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function LiveActivityCard() {
  const t = useThemeTokens();
  const { data } = useQuery({ queryKey: ['crypto-activity'], queryFn: fetchCryptoActivity, refetchInterval: 5_000 });
  const rows: CryptoActivityRow[] = data?.data ?? [];
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  return (
    <Card icon={<Bolt sx={{ fontSize: 18 }} />} title="LIVE ACTIVITY" tokens={t}>
      {rows.length === 0 ? (
        <Typography sx={{ fontSize: '0.8rem', color: t.text.tertiary }}>No activity yet.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {rows.slice(0, 6).map((r, i) => {
            const up = r.side === 'UP';
            const col = up ? t.up : t.down;
            const amt = `$${(Number(r.amount) / 1_000_000).toFixed(2)}`;
            return (
              <Box key={`${r.walletAddress}-${r.createdAt}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box component="img" src={up ? '/assets/up-icon-64x64.png' : '/assets/down-icon-64x64.png'} alt={r.side} sx={{ width: 22, height: 22, flexShrink: 0 }} />

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: t.text.primary }}>{short(r.walletAddress)}</Typography>
                  <Typography sx={{ fontSize: '0.74rem', color: t.text.secondary }}>
                    Predicts <Box component="span" sx={{ color: col, fontWeight: 700 }}>{r.side}</Box> on {r.asset} · {amt}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '0.66rem', color: t.text.tertiary, whiteSpace: 'nowrap' }}>{ago(r.createdAt, now)}</Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Card>
  );
}
