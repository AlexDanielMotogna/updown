'use client';

import {
  Box,
  Container,
  Typography,
  Avatar,
  Skeleton,
  Tooltip,
} from '@mui/material';
import {
  ContentCopy,
  CheckCircle,
  InfoOutlined,
  Share,
  TrendingUp,
  TrendingDown,
  EmojiEvents,
  AccountBalanceWallet,
} from '@mui/icons-material';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ConnectWalletButton } from '@/components';
import { UserLevelBadge } from '@/components/UserLevelBadge';
import { XpProgressBar } from '@/components/XpProgressBar';
import { formatUSDC, USDC_DIVISOR } from '@/lib/format';
import { UP_COINS_DIVISOR, getAvatarUrl } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { UserProfile } from '@/lib/api';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function tooltipSlotProps(t: ReturnType<typeof useThemeTokens>) {
  return {
    tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } },
    arrow: { sx: { color: t.bg.tooltip } },
  } as const;
}

/** One of the four north-star metric tiles. */
function HeroTile({ label, value, sub, color, icon, tip }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color: string;
  icon?: ReactNode;
  tip?: string;
}) {
  const t = useThemeTokens();
  return (
    <Box sx={{ bgcolor: t.hover.light, borderRadius: 1.5, px: { xs: 1.5, md: 2 }, py: { xs: 1.25, md: 1.75 }, display: 'flex', flexDirection: 'column', gap: 0.4, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {icon}
        <Typography sx={{ fontSize: { xs: '0.6rem', md: '0.68rem' }, fontWeight: 600, color: t.text.tertiary, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          {label}
        </Typography>
        {tip && (
          <Tooltip title={tip} arrow placement="top" slotProps={tooltipSlotProps(t)}>
            <InfoOutlined sx={{ fontSize: 11, color: t.border.emphasis, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
          </Tooltip>
        )}
      </Box>
      <Typography sx={{ fontSize: { xs: '1.05rem', md: '1.4rem' }, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </Typography>
      {sub != null && (
        <Typography sx={{ fontSize: { xs: '0.62rem', md: '0.7rem' }, fontWeight: 500, color: t.text.quaternary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

interface ProfileHeaderProps {
  connected: boolean;
  walletAddress: string | null;
  userProfile: UserProfile | null | undefined;
  balance: { uiAmount: number } | null | undefined;
}

export function ProfileHeader({
  connected,
  walletAddress,
  userProfile,
  balance,
}: ProfileHeaderProps) {
  const t = useThemeTokens();
  const [copied, setCopied] = useState(false);
  const [refCopied, setRefCopied] = useState(false);

  const handleCopy = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareReferral = () => {
    if (!userProfile?.referralCode) return;
    const url = `${window.location.origin}/?ref=${userProfile.referralCode}`;
    navigator.clipboard.writeText(url);
    setRefCopied(true);
    setTimeout(() => setRefCopied(false), 2000);
  };

  // ── Derived metrics (all-time, from the profile aggregate) ──
  const wagered = Number(userProfile?.stats.totalWagered ?? '0');
  const won = Number(userProfile?.stats.totalWon ?? '0');
  const netPnl = won - wagered;
  const pnlPositive = netPnl >= 0;
  const totalBets = userProfile?.stats.totalBets ?? 0;
  const totalWins = userProfile?.stats.totalWins ?? 0;
  const losses = Math.max(0, totalBets - totalWins);

  const level = userProfile?.level ?? 1;
  const tierIndex = Math.min(Math.floor((level - 1) / 4), 9);
  const ringColor = t.levelTiers[tierIndex];

  const memberSince = userProfile?.createdAt
    ? new Date(userProfile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  // Percentile only reads well with a meaningful population.
  const percentile = userProfile?.rank && userProfile?.totalUsers && userProfile.totalUsers >= 25
    ? Math.max(1, Math.ceil((userProfile.rank / userProfile.totalUsers) * 100))
    : null;

  const xpInLevel = userProfile
    ? Number(userProfile.totalXp) - Number(userProfile.xpForCurrentLevel)
    : 0;
  const xpSpan = userProfile
    ? Number(userProfile.xpForNextLevel) - Number(userProfile.xpForCurrentLevel)
    : 0;

  return (
    <>
      <Box sx={{ bgcolor: t.bg.app, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Container maxWidth={false} sx={{ maxWidth: 1400, px: { xs: 2, md: 3 } }}>
          {/* ─── Banner — lives inside the same container so its edges line up
              exactly with the content below (no overhang) ─── */}
          <Box
            sx={{
              width: '100%',
              height: { xs: 120, sm: 150, md: 180 },
              borderRadius: 2,
              backgroundImage: 'url(/Banner/banner-web-1500x300.gif)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              backgroundColor: t.bg.app,
            }}
          />
          {!connected ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography sx={{ color: 'text.secondary', fontWeight: 400, mb: 3, fontSize: '1rem' }}>
                Connect your wallet to view your profile
              </Typography>
              <ConnectWalletButton variant="page" />
            </Box>
          ) : (
            <>
              {/* ─── Identity row (overlaps banner) ─── */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: { xs: 'flex-start', sm: 'flex-end' },
                  gap: { xs: 1.5, md: 2 },
                  mt: { xs: -4, md: -5 },
                  flexWrap: 'wrap',
                }}
              >
                {/* Avatar with level ring + badge */}
                <Box sx={{ position: 'relative', flexShrink: 0 }}>
                  {walletAddress ? (
                    <Avatar
                      src={getAvatarUrl(walletAddress)}
                      sx={{
                        width: { xs: 64, md: 84 },
                        height: { xs: 64, md: 84 },
                        border: `3px solid ${ringColor}`,
                        boxShadow: `0 0 0 4px ${t.bg.app}`,
                        bgcolor: t.bg.surface,
                      }}
                    />
                  ) : (
                    <Skeleton variant="circular" width={84} height={84} sx={{ bgcolor: t.border.default }} />
                  )}
                  {userProfile && (
                    <Box sx={{ position: 'absolute', bottom: -10, right: -6 }}>
                      <UserLevelBadge level={userProfile.level} title={userProfile.title} size="sm" variant="icon-only" />
                    </Box>
                  )}
                </Box>

                {/* Name + meta */}
                <Box sx={{ minWidth: 0, flex: 1, pb: { xs: 0, sm: 0.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography sx={{ fontSize: { xs: '1.05rem', md: '1.4rem' }, fontWeight: 800, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {walletAddress ? truncateAddress(walletAddress) : ''}
                    </Typography>
                    <Box component="button" onClick={handleCopy} sx={{ background: 'none', border: 'none', cursor: 'pointer', p: 0, display: 'flex', alignItems: 'center', flexShrink: 0, color: copied ? t.gain : t.text.dimmed, '&:hover': { color: t.text.primary } }}>
                      {copied ? <CheckCircle sx={{ fontSize: 15 }} /> : <ContentCopy sx={{ fontSize: 15 }} />}
                    </Box>
                  </Box>

                  {/* Meta line: level + rank chip (same baseline) */}
                  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: { xs: 0.75, md: 1.25 }, mt: 0.5 }}>
                    <Typography sx={{ fontSize: { xs: '0.8rem', md: '0.9rem' }, fontWeight: 700, color: ringColor, lineHeight: 1.2 }}>
                      Lv.{level} {userProfile?.title ?? ''}
                    </Typography>
                    {userProfile?.rank && (
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, px: 0.9, py: 0.2, borderRadius: 1, bgcolor: withAlpha(t.gold, 0.12) }}>
                        <EmojiEvents sx={{ fontSize: 13, color: t.gold }} />
                        <Typography sx={{ fontSize: { xs: '0.72rem', md: '0.78rem' }, fontWeight: 700, color: t.gold, lineHeight: 1.2 }}>
                          #{userProfile.rank}{percentile ? ` · Top ${percentile}%` : ''}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  {/* Secondary meta: member since (below, lower visual weight) */}
                  {memberSince && (
                    <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.75rem' }, fontWeight: 500, color: t.text.quaternary, mt: 0.3 }}>
                      Member since {memberSince}
                    </Typography>
                  )}
                </Box>

                {/* Actions: balance pill + share */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, pb: { xs: 0, sm: 0.5 } }}>
                  <Tooltip title="Your USDC balance on Solana" arrow placement="bottom" slotProps={tooltipSlotProps(t)}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, px: 1.25, py: 0.75, borderRadius: 1, bgcolor: t.hover.light, border: `1px solid ${t.border.subtle}` }}>
                      <AccountBalanceWallet sx={{ fontSize: 16, color: t.text.tertiary }} />
                      <Typography sx={{ fontSize: { xs: '0.8rem', md: '0.9rem' }, fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                        ${balance ? balance.uiAmount.toFixed(2) : '0.00'}
                      </Typography>
                    </Box>
                  </Tooltip>
                  {userProfile?.referralCode && (
                    <Tooltip title={refCopied ? 'Invite link copied!' : 'Copy your invite link'} arrow placement="bottom" slotProps={tooltipSlotProps(t)}>
                      <Box component="button" onClick={handleShareReferral} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.25, py: 0.8, borderRadius: 1, cursor: 'pointer', border: `1px solid ${t.border.subtle}`, bgcolor: refCopied ? withAlpha(t.gain, 0.12) : t.hover.light, color: refCopied ? t.gain : t.text.secondary, transition: 'all 0.15s', '&:hover': { color: t.accent, borderColor: t.border.default } }}>
                        {refCopied ? <CheckCircle sx={{ fontSize: 15 }} /> : <Share sx={{ fontSize: 15 }} />}
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>Share</Typography>
                      </Box>
                    </Tooltip>
                  )}
                </Box>
              </Box>

              {/* ─── XP progress ─── */}
              {userProfile && (
                <Box sx={{ mt: 2 }}>
                  <XpProgressBar profile={userProfile} />
                </Box>
              )}

              {/* ─── Hero metrics (4 north-star tiles) ─── */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
                  gap: { xs: 1, md: 1.5 },
                  py: { xs: 2, md: 2.5 },
                }}
              >
                <HeroTile
                  label="Net P&L"
                  tip="All-time profit/loss: realized winnings minus total staked"
                  icon={pnlPositive
                    ? <TrendingUp sx={{ fontSize: 15, color: t.gain }} />
                    : <TrendingDown sx={{ fontSize: 15, color: t.down }} />}
                  color={pnlPositive ? t.gain : t.down}
                  value={`${pnlPositive ? '+' : ''}${formatUSDC(String(netPnl), { min: 2 })}`}
                  sub={`${formatUSDC(String(won), { min: 0 })} won · ${formatUSDC(String(wagered), { min: 0 })} staked`}
                />
                <HeroTile
                  label="Win Rate"
                  tip="Share of your predictions that won"
                  color={t.gain}
                  value={`${userProfile?.stats.winRate ?? '0.0'}%`}
                  sub={`${totalWins}W / ${losses}L`}
                />
                <HeroTile
                  label="Volume Staked"
                  tip="Total USDC you have staked across all pools"
                  color={t.text.primary}
                  value={formatUSDC(String(wagered), { min: 0 })}
                  sub={`${totalBets} prediction${totalBets === 1 ? '' : 's'}`}
                />
                <HeroTile
                  label="UP Coins"
                  tip="Coins earned from activity. Convert to $UP at launch"
                  color={t.accent}
                  icon={<Box component="img" src="/token/Token_16px_Gold.png" alt="UP" sx={{ width: 14, height: 14 }} />}
                  value={userProfile ? (Number(userProfile.coinsBalance) / UP_COINS_DIVISOR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                  sub={`best streak ${userProfile?.stats.bestStreak ?? 0}`}
                />
              </Box>
            </>
          )}
        </Container>
      </Box>
    </>
  );
}
