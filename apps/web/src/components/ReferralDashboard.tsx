'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Tooltip,
  Tabs,
  Tab,
} from '@mui/material';
import {
  ContentCopy,
  CheckCircle,
  InfoOutlined,
  OpenInNew,
} from '@mui/icons-material';
import Avatar from '@mui/material/Avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchReferralStats, fetchReferralEarnings, fetchReferralPayouts, claimReferralPayout } from '@/lib/api';
import { GAIN_COLOR, ACCENT_COLOR, UP_COLOR, getAvatarUrl } from '@/lib/constants';
import { USDC_DIVISOR, getExplorerTxUrl } from '@/lib/format';
import { useNotificationStore } from '@/stores/notificationStore';
import { buildNotification } from '@/lib/notifications';

function truncateWallet(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

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
      {/* ─── Share Section ─── */}
      <Box sx={{ bgcolor: '#0D1219' }}>
        <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1.5, md: 2 } }}>
          <Box
            sx={{
              bgcolor: 'rgba(255,255,255,0.03)',
              borderRadius: 2,
              px: { xs: 1.5, md: 2.5 },
              py: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, minHeight: 12 }}>
              <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>
                Your Referral Link
              </Typography>
              <Tooltip title="Share this link with friends. You earn 20% of platform fees from their bets" arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                <InfoOutlined sx={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
              </Tooltip>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
              <Typography
                sx={{
                  fontSize: { xs: '0.8rem', md: '0.85rem' },
                  fontWeight: 600,
                  color: '#fff',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {referralUrl || '...'}
              </Typography>
              <Box
                component="button"
                onClick={handleCopy}
                sx={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  p: 0,
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  color: copied ? GAIN_COLOR : 'rgba(255,255,255,0.3)',
                  '&:hover': { color: '#fff' },
                  transition: 'color 0.15s',
                }}
              >
                {copied ? <CheckCircle sx={{ fontSize: 13 }} /> : <ContentCopy sx={{ fontSize: 13 }} />}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ─── Stats Cards (same pattern as PoolInfoCards) ─── */}
      <Box sx={{ bgcolor: '#0D1219' }}>
        <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1.5, md: 2 } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
              gap: 0.5,
            }}
          >
            {/* Total Referrals */}
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, minHeight: 12 }}>
                  <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>
                    Total Referrals
                  </Typography>
                  <Tooltip title="Users who accepted your referral link" arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                    <InfoOutlined sx={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
                  </Tooltip>
                </Box>
                <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                  {stats?.totalReferrals ?? 0}
                </Typography>
              </Box>
            </Box>

            {/* Total Earned */}
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, minHeight: 12 }}>
                  <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>
                    Total Earned
                  </Typography>
                  <Tooltip title="Total commissions earned from all referred users" arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                    <InfoOutlined sx={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
                  </Tooltip>
                </Box>
                <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                  ${totalEarned.toFixed(2)}
                </Typography>
              </Box>
            </Box>

            {/* Unpaid Balance */}
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, minHeight: 12 }}>
                  <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>
                    Unpaid Balance
                  </Typography>
                  <Tooltip title="Commissions available to claim. Minimum $1 USDC" arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                    <InfoOutlined sx={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
                  </Tooltip>
                </Box>
                <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, color: ACCENT_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                  ${unpaidBalance.toFixed(2)}
                </Typography>
              </Box>
            </Box>

            {/* Claim Button Card */}
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {unpaidBalance > 0 ? (
                <Button
                  variant="contained"
                  onClick={handleClaim}
                  disabled={!canClaim || claiming}
                  sx={{
                    bgcolor: canClaim ? GAIN_COLOR : 'rgba(255,255,255,0.06)',
                    color: canClaim ? '#000' : 'text.secondary',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    borderRadius: '2px',
                    textTransform: 'none',
                    px: 3,
                    py: 0.75,
                    width: '100%',
                    '&:hover': { bgcolor: canClaim ? GAIN_COLOR : undefined, filter: canClaim ? 'brightness(1.15)' : undefined },
                    '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
                  }}
                >
                  {claiming ? (
                    <CircularProgress size={18} sx={{ color: '#000' }} />
                  ) : canClaim ? (
                    `Claim $${unpaidBalance.toFixed(2)}`
                  ) : (
                    'Min $1.00'
                  )}
                </Button>
              ) : (
                <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.25)', fontWeight: 500 }}>
                  No balance
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </Box>

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

        {/* ─── Tab: Referrals ─── */}
        {tab === 0 && stats && stats.referrals.length > 0 && (
          <Box
            sx={{
              borderRadius: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              mb: 4,
            }}
          >
            {/* Header - desktop only */}
            <Box
              sx={{
                display: { xs: 'none', md: 'grid' },
                gridTemplateColumns: '50px 2fr 1.5fr 1fr',
                px: 2,
                py: 1,
                bgcolor: '#0D1219',
              }}
            >
              {[
                { label: '#', tip: 'Referral number', align: 'flex-start' },
                { label: 'Player', tip: 'Wallet address of the referred user', align: 'flex-start' },
                { label: 'Joined', tip: 'When the user accepted the referral', align: 'flex-start' },
                { label: 'Earned', tip: 'Total commissions generated by this user', align: 'flex-end' },
              ].map((h) => (
                <Box key={h.label} sx={{ display: 'flex', alignItems: 'center', justifyContent: h.align, gap: 0.4 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
                    {h.label}
                  </Typography>
                  <Tooltip title={h.tip} arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                    <InfoOutlined sx={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
                  </Tooltip>
                </Box>
              ))}
            </Box>

            {/* Rows */}
            <AnimatePresence mode="popLayout">
              {stats.referrals.map((ref, i) => (
                <motion.div
                  key={ref.wallet}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02, type: 'spring', stiffness: 300, damping: 30 }}
                  layout
                >
                  {/* Desktop row */}
                  <Box
                    sx={{
                      display: { xs: 'none', md: 'grid' },
                      gridTemplateColumns: '50px 2fr 1.5fr 1fr',
                      alignItems: 'center',
                      px: 2,
                      py: 0,
                      minHeight: 56,
                      bgcolor: '#0D1219',
                      transition: 'background 0.15s ease',
                      '&:hover': { background: 'rgba(255,255,255,0.04)' },
                    }}
                  >
                    {/* # */}
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                      {i + 1}
                    </Typography>

                    {/* Player */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                      <Avatar
                        src={getAvatarUrl(ref.wallet)}
                        alt={ref.wallet}
                        sx={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}
                      />
                      <Typography
                        sx={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: '#fff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ref.wallet.slice(0, 4)}...{ref.wallet.slice(-4)}
                      </Typography>
                    </Box>

                    {/* Joined */}
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {new Date(ref.joinedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                    </Typography>

                    {/* Earned */}
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                      ${(Number(ref.earned) / USDC_DIVISOR).toFixed(2)}
                    </Typography>
                  </Box>

                  {/* Mobile card */}
                  <Box
                    sx={{
                      display: { xs: 'block', md: 'none' },
                      bgcolor: '#0D1219',
                      p: 2,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.secondary', width: 28, textAlign: 'center', flexShrink: 0 }}>
                        {i + 1}
                      </Typography>
                      <Avatar
                        src={getAvatarUrl(ref.wallet)}
                        alt={ref.wallet}
                        sx={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}
                      />
                      <Typography
                        sx={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: '#fff',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ref.wallet.slice(0, 6)}...{ref.wallet.slice(-4)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, pt: 1.5 }}>
                      <Box>
                        <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(ref.joinedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                        </Typography>
                        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase' }}>
                          Joined
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                          ${(Number(ref.earned) / USDC_DIVISOR).toFixed(2)}
                        </Typography>
                        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase' }}>
                          Earned
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </motion.div>
              ))}
            </AnimatePresence>
          </Box>
        )}

        {tab === 0 && stats && stats.totalReferrals === 0 && (
          <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
            <Typography color="text.secondary" sx={{ fontSize: '1rem' }}>
              No referrals yet. Share your link to start earning!
            </Typography>
          </Box>
        )}

        {/* ─── Tab: Earnings ─── */}
        {tab === 1 && earnings && earnings.length > 0 && (
          <Box
            sx={{
              borderRadius: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              mb: 4,
            }}
          >
            {/* Header - desktop only */}
            <Box
              sx={{
                display: { xs: 'none', md: 'grid' },
                gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr 0.8fr',
                px: 2,
                py: 1,
                bgcolor: '#0D1219',
              }}
            >
              {[
                { label: 'From', tip: 'Wallet of the referred user who generated this commission', align: 'flex-start' },
                { label: 'Date', tip: 'When the commission was earned', align: 'flex-start' },
                { label: 'Commission', tip: '1% of the bet amount', align: 'flex-start' },
                { label: 'Status', tip: 'Whether the commission has been paid out', align: 'flex-start' },
                { label: 'Tx', tip: 'Payout transaction on Solana Explorer', align: 'flex-end' },
              ].map((h) => (
                <Box key={h.label} sx={{ display: 'flex', alignItems: 'center', justifyContent: h.align, gap: 0.4 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
                    {h.label}
                  </Typography>
                  <Tooltip title={h.tip} arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                    <InfoOutlined sx={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
                  </Tooltip>
                </Box>
              ))}
            </Box>

            {/* Rows */}
            <AnimatePresence mode="popLayout">
              {earnings.map((e, i) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02, type: 'spring', stiffness: 300, damping: 30 }}
                  layout
                >
                  {/* Desktop row */}
                  <Box
                    sx={{
                      display: { xs: 'none', md: 'grid' },
                      gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr 0.8fr',
                      alignItems: 'center',
                      px: 2,
                      py: 0,
                      minHeight: 56,
                      bgcolor: '#0D1219',
                      transition: 'background 0.15s ease',
                      '&:hover': { background: 'rgba(255,255,255,0.04)' },
                    }}
                  >
                    {/* From */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                      <Avatar
                        src={getAvatarUrl(e.referredWallet)}
                        alt={e.referredWallet}
                        sx={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}
                      />
                      <Typography
                        sx={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: '#fff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {e.referredWallet.slice(0, 4)}...{e.referredWallet.slice(-4)}
                      </Typography>
                    </Box>

                    {/* Date */}
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {new Date(e.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                    </Typography>

                    {/* Commission */}
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                      ${(Number(e.commissionAmount) / USDC_DIVISOR).toFixed(2)}
                    </Typography>

                    {/* Status */}
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        height: 20,
                        px: 1,
                        borderRadius: '2px',
                        bgcolor: e.paid ? `${GAIN_COLOR}18` : `${ACCENT_COLOR}18`,
                        width: 'fit-content',
                      }}
                    >
                      <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: e.paid ? GAIN_COLOR : ACCENT_COLOR }}>
                        {e.paid ? 'PAID' : 'PENDING'}
                      </Typography>
                    </Box>

                    {/* Tx */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 0.75 }}>
                      {e.paidTx ? (
                        <Button
                          component="a"
                          href={getExplorerTxUrl(e.paidTx)}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="small"
                          sx={{
                            minWidth: 0, px: 1, py: 0.25, fontSize: '0.65rem', color: 'text.secondary',
                            textTransform: 'none', gap: 0.5,
                            '&:hover': { color: '#FFFFFF' },
                          }}
                        >
                          Payout <OpenInNew sx={{ fontSize: 12 }} />
                        </Button>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.15)' }}>—</Typography>
                      )}
                    </Box>
                  </Box>

                  {/* Mobile card */}
                  <Box
                    sx={{
                      display: { xs: 'block', md: 'none' },
                      bgcolor: '#0D1219',
                      p: 2,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <Avatar
                        src={getAvatarUrl(e.referredWallet)}
                        alt={e.referredWallet}
                        sx={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}
                      />
                      <Typography
                        sx={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: '#fff',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {e.referredWallet.slice(0, 6)}...{e.referredWallet.slice(-4)}
                      </Typography>
                      <Box
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          height: 20,
                          px: 1,
                          borderRadius: '2px',
                          bgcolor: e.paid ? `${GAIN_COLOR}18` : `${ACCENT_COLOR}18`,
                        }}
                      >
                        <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, color: e.paid ? GAIN_COLOR : ACCENT_COLOR }}>
                          {e.paid ? 'PAID' : 'PENDING'}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, pt: 1.5 }}>
                      <Box>
                        <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(e.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                        </Typography>
                        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase' }}>
                          Date
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                          ${(Number(e.commissionAmount) / USDC_DIVISOR).toFixed(2)}
                        </Typography>
                        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase' }}>
                          Commission
                        </Typography>
                      </Box>
                    </Box>
                    {e.paidTx && (
                      <Box sx={{ pt: 1.5 }}>
                        <Button
                          component="a"
                          href={getExplorerTxUrl(e.paidTx)}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="small"
                          sx={{
                            minWidth: 0, px: 1, py: 0.25, fontSize: '0.65rem', color: 'text.secondary',
                            textTransform: 'none', gap: 0.5,
                            '&:hover': { color: '#FFFFFF' },
                          }}
                        >
                          Payout <OpenInNew sx={{ fontSize: 12 }} />
                        </Button>
                      </Box>
                    )}
                  </Box>
                </motion.div>
              ))}
            </AnimatePresence>
          </Box>
        )}

        {tab === 1 && (!earnings || earnings.length === 0) && (
          <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
            <Typography color="text.secondary" sx={{ fontSize: '1rem' }}>
              No earnings yet. Commissions appear when your referrals place bets.
            </Typography>
          </Box>
        )}

        {/* ─── Tab: Payouts ─── */}
        {tab === 2 && payouts && payouts.length > 0 && (
          <Box
            sx={{
              borderRadius: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              mb: 4,
            }}
          >
            {/* Header - desktop only */}
            <Box
              sx={{
                display: { xs: 'none', md: 'grid' },
                gridTemplateColumns: '1fr 1fr 1fr',
                px: 2,
                py: 1,
                bgcolor: '#0D1219',
              }}
            >
              {[
                { label: 'Amount', tip: 'USDC paid out', align: 'flex-start' },
                { label: 'Transaction', tip: 'On-chain transaction signature', align: 'flex-start' },
                { label: 'Date', tip: 'When the payout was processed', align: 'flex-end' },
              ].map((h) => (
                <Box key={h.label} sx={{ display: 'flex', alignItems: 'center', justifyContent: h.align, gap: 0.4 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
                    {h.label}
                  </Typography>
                  <Tooltip title={h.tip} arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                    <InfoOutlined sx={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
                  </Tooltip>
                </Box>
              ))}
            </Box>

            {/* Rows */}
            <AnimatePresence mode="popLayout">
              {payouts.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02, type: 'spring', stiffness: 300, damping: 30 }}
                  layout
                >
                  {/* Desktop row */}
                  <Box
                    sx={{
                      display: { xs: 'none', md: 'grid' },
                      gridTemplateColumns: '1fr 1fr 1fr',
                      alignItems: 'center',
                      px: 2,
                      py: 0,
                      minHeight: 56,
                      bgcolor: '#0D1219',
                      transition: 'background 0.15s ease',
                      '&:hover': { background: 'rgba(255,255,255,0.04)' },
                    }}
                  >
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                      ${(Number(p.amount) / USDC_DIVISOR).toFixed(2)}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {p.txSignature ? (
                        <Button
                          component="a"
                          href={getExplorerTxUrl(p.txSignature)}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="small"
                          sx={{
                            minWidth: 0, px: 1, py: 0.25, fontSize: '0.65rem', color: 'text.secondary',
                            textTransform: 'none', gap: 0.5,
                            '&:hover': { color: '#FFFFFF' },
                          }}
                        >
                          Payout <OpenInNew sx={{ fontSize: 12 }} />
                        </Button>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.15)' }}>—</Typography>
                      )}
                    </Box>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {new Date(p.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                    </Typography>
                  </Box>

                  {/* Mobile card */}
                  <Box sx={{ display: { xs: 'block', md: 'none' }, bgcolor: '#0D1219', p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                        ${(Number(p.amount) / USDC_DIVISOR).toFixed(2)}
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: 'text.secondary' }}>
                        {new Date(p.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                      </Typography>
                    </Box>
                    {p.txSignature && (
                      <Box sx={{ pt: 1.5 }}>
                        <Button
                          component="a"
                          href={getExplorerTxUrl(p.txSignature)}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="small"
                          sx={{
                            minWidth: 0, px: 1, py: 0.25, fontSize: '0.65rem', color: 'text.secondary',
                            textTransform: 'none', gap: 0.5,
                            '&:hover': { color: '#FFFFFF' },
                          }}
                        >
                          Payout <OpenInNew sx={{ fontSize: 12 }} />
                        </Button>
                      </Box>
                    )}
                  </Box>
                </motion.div>
              ))}
            </AnimatePresence>
          </Box>
        )}

        {tab === 2 && (!payouts || payouts.length === 0) && (
          <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
            <Typography color="text.secondary" sx={{ fontSize: '1rem' }}>
              No payouts yet. Claim your earnings when balance reaches $1.
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
