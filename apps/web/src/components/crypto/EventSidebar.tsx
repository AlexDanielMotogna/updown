'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Typography, Dialog, IconButton } from '@mui/material';
import { RocketLaunch, Bolt, AttachMoney, CheckCircle, Close } from '@mui/icons-material';
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

const ABOUT_ITEMS = ['5-minute prediction window', 'UP or DOWN', 'Instant results', 'Real payouts'];

/** About-the-event content, shown from the secondary header's "Read more" (and the mobile Info tab). */
export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useThemeTokens();
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: t.bg.surface, borderRadius: 1.5, border: `1px solid ${t.border.subtle}`, backgroundImage: 'none' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: CYAN }}>
          <RocketLaunch sx={{ fontSize: 18 }} />
          <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: t.text.primary }}>About this event</Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: t.text.tertiary }}><Close sx={{ fontSize: 18 }} /></IconButton>
      </Box>
      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontSize: '0.82rem', color: t.text.secondary, lineHeight: 1.55, mb: 1.5 }}>
          Make UP or DOWN predictions on crypto prices in 5-minute intervals. Fast. Simple. Transparent.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {ABOUT_ITEMS.map((it) => (
            <Box key={it} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircle sx={{ fontSize: 16, color: CYAN }} />
              <Typography sx={{ fontSize: '0.82rem', color: t.text.primary }}>{it}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Dialog>
  );
}

/**
 * Minimalist secondary header: the weekly $100 prize showcase as a slim dark
 * strip under the navbar, with a "Read more" that opens the About dialog.
 */
export function PrizeHeader() {
  const t = useThemeTokens();
  const { data } = useQuery({ queryKey: ['crypto-leaderboard', 'week'], queryFn: () => fetchCryptoLeaderboard('week'), refetchInterval: 20_000 });
  const participants = data?.data?.length ?? 0;
  const [now, setNow] = useState(() => Date.now());
  const [aboutOpen, setAboutOpen] = useState(false);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);

  // Dot separator between meta items (inline). Hidden on the very first item.
  const Dot = () => <Box component="span" sx={{ color: t.border.medium, mx: { xs: 0.75, sm: 1 } }}>·</Box>;
  const fs = { xs: '0.7rem', sm: '0.78rem' };

  return (
    <Box sx={{ borderBottom: `1px solid ${t.border.subtle}`, bgcolor: t.bg.surface }}>
      <Box
        sx={{
          width: '100%', maxWidth: 1400, mx: 'auto', px: { xs: 1.5, md: 3 }, py: { xs: 0.7, sm: 0.85 },
          // xs: two tidy centered lines (prize, then meta). sm+: single row with a divider dot.
          display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', justifyContent: 'center',
          columnGap: 1, rowGap: 0.15,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35 }}>
          <AttachMoney sx={{ fontSize: { xs: 14, sm: 15 }, color: t.text.secondary }} />
          <Typography component="span" sx={{ fontSize: fs, fontWeight: 800, color: t.text.primary, whiteSpace: 'nowrap' }}>
            Weekly $100 Prize
          </Typography>
        </Box>

        {/* Divider between prize and meta (desktop row only) */}
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, color: t.border.medium }}>·</Box>

        {/* Meta line: resets · players · read more */}
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Typography component="span" sx={{ fontSize: fs, color: t.text.secondary, whiteSpace: 'nowrap' }}>
            Resets in <Box component="span" sx={{ color: t.text.primary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{timeToWeeklyReset(now)}</Box>
          </Typography>
          <Dot />
          <Typography component="span" sx={{ fontSize: fs, color: t.text.secondary, whiteSpace: 'nowrap' }}>
            <Box component="span" sx={{ color: t.text.primary, fontWeight: 600 }}>{participants.toLocaleString()}</Box> {participants === 1 ? 'player' : 'players'}
          </Typography>
          <Dot />
          <Typography component="button" onClick={() => setAboutOpen(true)} sx={{ background: 'none', border: 'none', p: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: fs, fontWeight: 600, color: CYAN, whiteSpace: 'nowrap', '&:hover': { textDecoration: 'underline' } }}>
            Read more
          </Typography>
        </Box>
      </Box>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </Box>
  );
}

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
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
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.76rem', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{short(r.walletAddress)}</Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: t.text.secondary, whiteSpace: 'nowrap' }}>
                    <Box component="span" sx={{ color: col, fontWeight: 700 }}>{r.side}</Box> on {r.asset} · {amt}
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
