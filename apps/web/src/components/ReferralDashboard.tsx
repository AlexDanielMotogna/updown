'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchReferralStats, fetchReferralEarnings, fetchReferralPayouts, claimReferralPayout } from '@/lib/api';
import { ACCENT_COLOR, UP_COLOR } from '@/lib/constants';
import { USDC_DIVISOR } from '@/lib/format';
import { useNotificationStore } from '@/stores/notificationStore';
import { buildNotification } from '@/lib/notifications';
import { ReferralShareLink } from './referral/ReferralShareLink';
import { ReferralStatsCards } from './referral/ReferralStatsCards';
import { ReferralTab } from './referral/ReferralTab';
import { EarningsTab } from './referral/EarningsTab';
import { PayoutsTab } from './referral/PayoutsTab';

interface ReferralDashboardProps {
  walletAddress: string;
}

export function ReferralDashboard({ walletAddress }: ReferralDashboardProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [tab, setTab] = useState(0);
  const handleTabChange = useCallback((_: unknown, v: number) => setTab(v), []);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['referralStats', walletAddress],
    queryFn: () => fetchReferralStats(walletAddress),
    select: (res) => res.data,
    refetchInterval: 30_000,
  });

  const { data: earnings } = useQuery({
    queryKey: ['referralEarnings', walletAddress],
    queryFn: () => fetchReferralEarnings(walletAddress, { limit: 50 }),
    select: (res) => res.data,
    refetchInterval: 30_000,
  });

  const { data: payouts } = useQuery({
    queryKey: ['referralPayouts', walletAddress],
    queryFn: () => fetchReferralPayouts(walletAddress),
    select: (res) => res.data,
    refetchInterval: 30_000,
  });

  const referralUrl = stats?.referralCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/?ref=${stats.referralCode}`
    : '';

  const handleCopy = () => {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const res = await claimReferralPayout(walletAddress);
      if (res.success && res.data) {
        const usdcAmount = (Number(res.data.amount) / USDC_DIVISOR).toFixed(2);
        useNotificationStore.getState().push(
          buildNotification('REFERRAL_CLAIM_SUCCESS', { amount: usdcAmount }),
        );
      } else {
        useNotificationStore.getState().push(
          buildNotification('REFERRAL_CLAIM_FAILED', { error: res.error?.message }),
        );
      }
      queryClient.invalidateQueries({ queryKey: ['referralStats'] });
      queryClient.invalidateQueries({ queryKey: ['referralEarnings'] });
      queryClient.invalidateQueries({ queryKey: ['referralPayouts'] });
      queryClient.invalidateQueries({ queryKey: ['usdc-balance'] });
    } catch (err) {
      useNotificationStore.getState().push(
        buildNotification('REFERRAL_CLAIM_FAILED', {
          error: err instanceof Error ? err.message : 'Claim failed',
        }),
      );
    } finally {
      setClaiming(false);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} sx={{ color: UP_COLOR }} />
      </Box>
    );
  }

  const totalEarned = Number(stats?.totalEarned ?? '0') / USDC_DIVISOR;
  const unpaidBalance = Number(stats?.unpaidBalance ?? '0') / USDC_DIVISOR;
  const canClaim = unpaidBalance >= 1;

  return (
    <Box>
      <ReferralShareLink
        referralUrl={referralUrl}
        copied={copied}
        onCopy={handleCopy}
      />

      <ReferralStatsCards
        totalReferrals={stats?.totalReferrals ?? 0}
        totalEarned={totalEarned}
        unpaidBalance={unpaidBalance}
        canClaim={canClaim}
        claiming={claiming}
        onClaim={handleClaim}
      />

      {/* ─── Tabs ─── */}
      <Box sx={{ px: { xs: 1.5, md: 3 }, pt: { xs: 2, md: 3 } }}>
        <Box sx={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)', mb: 3 }}>
          <Tabs
            value={tab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons={false}
            sx={{
              minHeight: 44,
              '& .MuiTabs-indicator': { backgroundColor: ACCENT_COLOR, height: 2 },
              '& .MuiTab-root': {
                color: 'text.secondary',
                fontWeight: 500,
                textTransform: 'none',
                fontSize: { xs: '0.75rem', sm: '0.85rem' },
                px: { xs: 1.5, sm: 2.5 },
                minHeight: 44,
                minWidth: 'auto',
                '&.Mui-selected': { color: '#FFFFFF' },
              },
            }}
          >
            <Tab label={`Referrals (${stats?.totalReferrals ?? 0})`} />
            <Tab label={`Earnings (${earnings?.length ?? 0})`} />
            <Tab label={`Payouts (${payouts?.length ?? 0})`} />
          </Tabs>
        </Box>

        {tab === 0 && stats && (
          <ReferralTab
            referrals={stats.referrals}
            totalReferrals={stats.totalReferrals}
          />
        )}

        {tab === 1 && (
          <EarningsTab earnings={earnings ?? null} />
        )}

        {tab === 2 && (
          <PayoutsTab payouts={payouts ?? null} />
        )}
      </Box>
    </Box>
  );
}
