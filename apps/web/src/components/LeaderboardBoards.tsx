'use client';

import { Box, Typography, Avatar, CircularProgress } from '@mui/material';
import { AttachMoney, BarChart, MilitaryTech } from '@mui/icons-material';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useThemeTokens } from '@/app/providers';
import { formatUSDC } from '@/lib/format';
import { getAvatarUrl } from '@/lib/constants';
import type { LeaderboardEntry, LeaderboardSort } from '@/lib/api';

const BOARD_LIMIT = 25;

function truncate(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function rankColor(rank: number, t: ReturnType<typeof useThemeTokens>): string {
  if (rank === 1) return t.gold;
  if (rank === 2) return '#C0C0C0';
  if (rank === 3) return '#CD7F32';
  return t.text.quaternary;
}

interface BoardProps {
  title: string;
  icon: React.ReactNode;
  sort: LeaderboardSort;
  /** Renders the right-hand value for an entry. */
  value: (e: LeaderboardEntry) => React.ReactNode;
}

function Board({ title, icon, sort, value }: BoardProps) {
  const t = useThemeTokens();
  const { data, isLoading } = useLeaderboard({ sort, page: 1, limit: BOARD_LIMIT });
  const entries = data?.data ?? [];

  return (
    <Box sx={{ bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 2, overflow: 'hidden' }}>
      {/* Board header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Box sx={{ display: 'flex', color: t.text.secondary }}>{icon}</Box>
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: t.text.primary }}>{title}</Typography>
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={22} sx={{ color: t.text.dimmed }} />
        </Box>
      ) : entries.length === 0 ? (
        <Typography sx={{ fontSize: '0.82rem', color: t.text.tertiary, textAlign: 'center', py: 6 }}>
          No players yet
        </Typography>
      ) : (
        <Box>
          {entries.map((e) => (
            <Box
              key={e.walletAddress}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1,
                '& + &': { borderTop: `1px solid ${t.border.subtle}` },
                '&:hover': { bgcolor: t.hover.light },
              }}
            >
              <Typography sx={{ width: 22, flexShrink: 0, fontSize: '0.78rem', fontWeight: 800, color: rankColor(e.rank, t), fontVariantNumeric: 'tabular-nums' }}>
                {e.rank}
              </Typography>
              <Avatar src={e.avatarUrl ?? getAvatarUrl(e.walletAddress)} sx={{ width: 28, height: 28, flexShrink: 0, bgcolor: t.bg.surfaceAlt }} />
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.85rem', fontWeight: 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.displayName || truncate(e.walletAddress)}
              </Typography>
              <Box sx={{ flexShrink: 0, textAlign: 'right' }}>{value(e)}</Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/**
 * Three all-time leaderboards side by side — Profit, Volume and Predictions.
 * XP/levels remain the progression system elsewhere; these rank the metrics
 * that actually matter for a predictor.
 */
export function LeaderboardBoards() {
  const t = useThemeTokens();
  const usd = (micro?: string) => formatUSDC(micro ?? '0', { min: 0 });

  return (
    <Box sx={{ pt: { xs: 2, md: 3 }, pb: 6 }}>
      <Typography sx={{ fontSize: { xs: '1.4rem', md: '1.8rem' }, fontWeight: 900, color: t.text.primary, mb: 0.5 }}>
        Leaderboard
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: t.text.tertiary, mb: 3 }}>
        All-time · the metrics that matter
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
        <Board
          title="Profit"
          icon={<AttachMoney sx={{ fontSize: 20 }} />}
          sort="profit"
          value={(e) => {
            const p = Number(e.profit ?? '0');
            const pos = p >= 0;
            return (
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: pos ? t.gain : t.down, fontVariantNumeric: 'tabular-nums' }}>
                {pos ? '+' : '−'}{usd(String(Math.abs(p)))}
              </Typography>
            );
          }}
        />
        <Board
          title="Volume"
          icon={<BarChart sx={{ fontSize: 20 }} />}
          sort="volume"
          value={(e) => (
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
              {usd(e.totalWagered)}
            </Typography>
          )}
        />
        <Board
          title="Predictions"
          icon={<MilitaryTech sx={{ fontSize: 20 }} />}
          sort="predictions"
          value={(e) => (
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
              {e.totalBets.toLocaleString()}
            </Typography>
          )}
        />
      </Box>
    </Box>
  );
}
