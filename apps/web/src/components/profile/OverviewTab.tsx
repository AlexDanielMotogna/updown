'use client';

import { Box, Typography, Skeleton, Button } from '@mui/material';
import { ChevronRight, ArrowForward, Bolt } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { fetchUserCategoryStats, fetchRewardHistory, fetchReferralStats, type UserProfile } from '@/lib/api';
import { formatUSDC, USDC_DIVISOR } from '@/lib/format';
import { UP_COINS_DIVISOR } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { getCategoryMeta } from './category-meta';
import { getRewardMeta, formatRelativeTime } from './reward-meta';

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const t = useThemeTokens();
  return (
    <Box sx={{ bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 1.5, p: { xs: 1.75, md: 2 }, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: t.text.secondary, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}

function SeeAll({ onClick }: { onClick?: () => void }) {
  const t = useThemeTokens();
  if (!onClick) return null;
  return (
    <Box component="button" onClick={onClick} sx={{ display: 'flex', alignItems: 'center', gap: 0.25, background: 'none', border: 'none', cursor: 'pointer', p: 0, color: t.text.tertiary, '&:hover': { color: t.text.primary } }}>
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }}>See all</Typography>
      <ChevronRight sx={{ fontSize: 15 }} />
    </Box>
  );
}

// ── Card: performance by category ──
function PerformanceByCategory({ wallet }: { wallet: string }) {
  const t = useThemeTokens();
  const { data, isLoading } = useQuery({
    queryKey: ['categoryStats', wallet],
    queryFn: () => fetchUserCategoryStats(wallet),
    select: (r) => r.data,
    staleTime: 30_000,
  });

  if (isLoading) {
    return <>{[0, 1, 2].map(i => <Skeleton key={i} variant="rounded" height={44} sx={{ bgcolor: t.border.default, mb: 1, borderRadius: 1 }} />)}</>;
  }
  if (!data || data.length === 0) {
    return <Typography sx={{ fontSize: '0.8rem', color: t.text.quaternary, py: 2, textAlign: 'center' }}>No predictions yet.</Typography>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {data.map(row => {
        const meta = getCategoryMeta(row.category, t, 16);
        const net = Number(row.won) - Number(row.wagered);
        const positive = net >= 0;
        const wr = Number(row.winRate);
        return (
          <Box key={row.category}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, color: meta.color }}>
                {meta.icon}
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: t.text.primary }}>{meta.label}</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: t.text.quaternary }}>· {row.bets} bet{row.bets === 1 ? '' : 's'}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexShrink: 0 }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>{wr}%</Typography>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: positive ? t.gain : t.down, fontVariantNumeric: 'tabular-nums' }}>
                  {positive ? '+' : ''}{formatUSDC(String(net), { min: 0 })}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ width: '100%', height: 4, borderRadius: 2, bgcolor: t.border.default, overflow: 'hidden' }}>
              <Box sx={{ width: `${Math.min(100, wr)}%`, height: '100%', borderRadius: 2, bgcolor: meta.color }} />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

// ── Card: level & perks ──
function LevelPerks({ userProfile }: { userProfile: UserProfile | null | undefined }) {
  const t = useThemeTokens();
  if (!userProfile) {
    return <Skeleton variant="rounded" height={88} sx={{ bgcolor: t.border.default, borderRadius: 1 }} />;
  }
  const next = userProfile.nextLevel;
  const xpToGo = Math.max(0, Number(userProfile.xpForNextLevel) - Number(userProfile.totalXp));

  const Perk = ({ heading, level, fee, mult, dim }: { heading: string; level: string; fee: string; mult: number; dim?: boolean }) => (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: t.text.quaternary, letterSpacing: '0.05em', textTransform: 'uppercase', mb: 0.4 }}>{heading}</Typography>
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: dim ? t.text.tertiary : t.text.primary, mb: 0.6 }}>{level}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.3 }}>
        <Typography sx={{ fontSize: '0.72rem', color: t.text.quaternary }}>Fee</Typography>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: dim ? t.text.tertiary : t.gain, fontVariantNumeric: 'tabular-nums' }}>{fee}%</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontSize: '0.72rem', color: t.text.quaternary }}>Coins</Typography>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: dim ? t.text.tertiary : t.accent, fontVariantNumeric: 'tabular-nums' }}>{mult}x</Typography>
      </Box>
    </Box>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1 }}>
        <Perk heading="Now" level={`Lv.${userProfile.level} ${userProfile.title}`} fee={userProfile.feePercent} mult={userProfile.coinMultiplier} />
        {next && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', color: t.text.dimmed }}><ArrowForward sx={{ fontSize: 18 }} /></Box>
            <Perk heading="Next" level={`Lv.${next.level} ${next.title}`} fee={next.feePercent} mult={next.coinMultiplier} dim />
          </>
        )}
      </Box>
      <Box sx={{ mt: 1.5, pt: 1.25, borderTop: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', gap: 0.6 }}>
        <Bolt sx={{ fontSize: 15, color: t.accent }} />
        <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>
          {next ? <><b style={{ color: t.text.primary }}>{xpToGo.toLocaleString()} XP</b> to Lv.{next.level} - lower fees, more coins</> : 'Max level - top perks unlocked'}
        </Typography>
      </Box>
    </Box>
  );
}

// ── Card: recent activity ──
function RecentActivity({ wallet, onSeeAll }: { wallet: string; onSeeAll?: () => void }) {
  const t = useThemeTokens();
  const { data, isLoading } = useQuery({
    queryKey: ['rewards', wallet, 'recent'],
    queryFn: () => fetchRewardHistory(wallet, { limit: 6 }),
    select: (r) => r.data,
    staleTime: 30_000,
  });

  if (isLoading) {
    return <>{[0, 1, 2].map(i => <Skeleton key={i} variant="rounded" height={32} sx={{ bgcolor: t.border.default, mb: 0.75, borderRadius: 1 }} />)}</>;
  }
  if (!data || data.length === 0) {
    return <Typography sx={{ fontSize: '0.8rem', color: t.text.quaternary, py: 2, textAlign: 'center' }}>No activity yet.</Typography>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {data.map(r => {
        const meta = getRewardMeta(r.reason, t, 15);
        const isXp = r.type === 'XP';
        const amount = isXp
          ? `+${Number(r.amount).toLocaleString()} XP`
          : `+${(Number(r.amount) / UP_COINS_DIVISOR).toFixed(2)} UP`;
        return (
          <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ display: 'flex', color: meta.color, flexShrink: 0 }}>{meta.icon}</Box>
            <Typography sx={{ fontSize: '0.8rem', color: t.text.secondary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label}</Typography>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: isXp ? t.prediction : t.accent, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{amount}</Typography>
            <Typography sx={{ fontSize: '0.68rem', color: t.text.dimmed, flexShrink: 0, width: 52, textAlign: 'right' }}>{formatRelativeTime(r.createdAt)}</Typography>
          </Box>
        );
      })}
      <Box sx={{ mt: 0.5 }}><SeeAll onClick={onSeeAll} /></Box>
    </Box>
  );
}

// ── Card: referral snapshot ──
function ReferralSnapshot({ wallet, onManage }: { wallet: string; onManage?: () => void }) {
  const t = useThemeTokens();
  const { data, isLoading } = useQuery({
    queryKey: ['referralStats', wallet],
    queryFn: () => fetchReferralStats(wallet),
    select: (r) => r.data,
    staleTime: 30_000,
  });

  if (isLoading) {
    return <Skeleton variant="rounded" height={88} sx={{ bgcolor: t.border.default, borderRadius: 1 }} />;
  }

  const referrals = data?.totalReferrals ?? 0;
  const earned = Number(data?.totalEarned ?? '0') / USDC_DIVISOR;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: '1.3rem', fontWeight: 800, color: t.text.primary, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{referrals}</Typography>
          <Typography sx={{ fontSize: '0.68rem', color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Referred</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: '1.3rem', fontWeight: 800, color: t.gain, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>${earned.toFixed(2)}</Typography>
          <Typography sx={{ fontSize: '0.68rem', color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Earned</Typography>
        </Box>
      </Box>
      <Button
        onClick={onManage}
        fullWidth
        sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.78rem', color: t.accent, bgcolor: withAlpha(t.accent, 0.1), border: `1px solid ${withAlpha(t.accent, 0.25)}`, py: 0.6, '&:hover': { bgcolor: withAlpha(t.accent, 0.16) } }}
      >
        Invite friends & earn 1%
      </Button>
    </Box>
  );
}

interface OverviewTabProps {
  walletAddress: string;
  userProfile: UserProfile | null | undefined;
  onViewTab?: (key: 'rewards' | 'referrals') => void;
}

export function OverviewTab({ walletAddress, userProfile, onViewTab }: OverviewTabProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
        gap: { xs: 1.5, md: 2 },
        pb: 2,
      }}
    >
      <Panel title="Performance by category">
        <PerformanceByCategory wallet={walletAddress} />
      </Panel>
      <Panel title="Level & perks">
        <LevelPerks userProfile={userProfile} />
      </Panel>
      <Panel title="Recent activity">
        <RecentActivity wallet={walletAddress} onSeeAll={onViewTab ? () => onViewTab('rewards') : undefined} />
      </Panel>
      <Panel title="Referrals">
        <ReferralSnapshot wallet={walletAddress} onManage={onViewTab ? () => onViewTab('referrals') : undefined} />
      </Panel>
    </Box>
  );
}
