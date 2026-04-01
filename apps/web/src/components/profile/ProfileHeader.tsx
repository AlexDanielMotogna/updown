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
} from '@mui/icons-material';
import { useState } from 'react';
import { ConnectWalletButton } from '@/components';
import { UserLevelBadge } from '@/components/UserLevelBadge';
import { formatUSDC, USDC_DIVISOR } from '@/lib/format';
import { UP_COINS_DIVISOR, getAvatarUrl } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface ProfileHeaderProps {
  connected: boolean;
  walletAddress: string | null;
  userProfile: {
    level: number;
    title: string;
    xpProgress: number;
    totalXp: string;
    xpForCurrentLevel: string;
    xpForNextLevel: string;
    coinsBalance: string;
    referralCode?: string | null;
    stats: {
      totalBets: number;
      totalWins: number;
      winRate: string;
      currentStreak: number;
      bestStreak: number;
    };
  } | null | undefined;
  balance: { uiAmount: number } | null | undefined;
  totalBets: number;
  wonCount: number;
  lostCount: number;
  totalStaked: number;
  totalPayout: number;
}

export function ProfileHeader({
  connected,
  walletAddress,
  userProfile,
  balance,
  totalBets,
  wonCount,
  lostCount,
  totalStaked,
  totalPayout,
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

  return (
    <>
      {/* ─── Stats Row (top, like Hellcase) ─── */}
      <Box sx={{ bgcolor: t.bg.app, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Container maxWidth={false} sx={{ px: { xs: 1.5, md: 3 } }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: { xs: 0.5, md: 0 },
              py: { xs: 1, md: 1.5 },
            }}
          >
            {[
              { value: userProfile?.stats.totalBets ?? 0, label: 'PREDICTIONS', color: t.up, tip: 'Total predictions placed across all pools' },
              { value: `${userProfile?.stats.totalWins ?? 0}`, label: 'WINS', color: t.gain, tip: 'Predictions where your side won' },
              { value: `${userProfile?.stats.winRate ?? '0'}%`, label: 'WIN RATE', color: t.gain, tip: 'Percentage of predictions you won' },
              { value: userProfile?.stats.currentStreak ?? 0, label: 'CURRENT STREAK', color: t.accent, tip: 'Consecutive wins right now. Resets on loss' },
              { value: userProfile?.stats.bestStreak ?? 0, label: 'BEST STREAK', color: t.accent, tip: 'Longest win streak you have achieved' },
            ].map((stat, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  flexShrink: 0,
                }}
              >
                <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 700, color: stat.color, fontVariantNumeric: 'tabular-nums' }}>
                  {stat.value}
                </Typography>
                <Typography sx={{ fontSize: { xs: '0.55rem', md: '0.65rem' }, fontWeight: 600, color: t.text.quaternary, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  {stat.label}
                </Typography>
                <Tooltip title={stat.tip} arrow placement="bottom" slotProps={{ tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } }, arrow: { sx: { color: t.bg.tooltip } } }}>
                  <InfoOutlined sx={{ fontSize: 10, color: t.border.emphasis, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
                </Tooltip>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* ─── Banner ─── */}
      <Box
        sx={{
          width: '100%',
          height: { xs: 140, sm: 180, md: 240 },
          backgroundImage: 'url(/Banner/banner-web-1500x300.gif)',
          backgroundSize: 'contain',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
          backgroundColor: t.bg.app,
        }}
      />

      {/* ─── Profile Strip (overlaps banner bottom) ─── */}
      <Box sx={{ bgcolor: t.bg.app }}>
        <Container maxWidth={false} sx={{ px: { xs: 2, md: 3 } }}>
          {!connected ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography sx={{ color: 'text.secondary', fontWeight: 400, mb: 3, fontSize: '1rem' }}>
                Connect your wallet to view your profile
              </Typography>
              <ConnectWalletButton variant="page" />
            </Box>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: '2.5fr repeat(6, 1fr)' },
                gap: 0.5,
                mt: { xs: -3, md: -5 },
                py: { xs: 1.5, md: 2 },
              }}
            >
              {/* ── Card 1: Avatar + Level + XP (full width on mobile, 2 cols on desktop) ── */}
              <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 2 }, bgcolor: t.hover.light, borderRadius: 1, px: { xs: 1.5, md: 3 }, py: 1.5 }}>
                <Box sx={{ position: 'relative', flexShrink: 0 }}>
                  {walletAddress ? (
                    <Avatar
                      src={getAvatarUrl(walletAddress)}
                      sx={{ width: { xs: 40, md: 56 }, height: { xs: 40, md: 56 } }}
                    />
                  ) : (
                    <Skeleton variant="circular" width={56} height={56} sx={{ bgcolor: t.border.default }} />
                  )}
                  {userProfile && (
                    <Box sx={{ position: 'absolute', bottom: -16, right: -6 }}>
                      <UserLevelBadge level={userProfile.level} title={userProfile.title} size="sm" variant="icon-only" />
                    </Box>
                  )}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography sx={{ fontSize: { xs: '0.85rem', md: '1rem' }, fontWeight: 700, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {walletAddress ? truncateAddress(walletAddress) : ''}
                    </Typography>
                    <Box
                      component="button"
                      onClick={handleCopy}
                      sx={{
                        background: 'none', border: 'none', cursor: 'pointer', p: 0,
                        display: 'flex', alignItems: 'center', flexShrink: 0,
                        color: copied ? t.gain : t.text.dimmed,
                        '&:hover': { color: t.text.primary },
                      }}
                    >
                      {copied ? <CheckCircle sx={{ fontSize: 13 }} /> : <ContentCopy sx={{ fontSize: 13 }} />}
                    </Box>
                    {userProfile?.referralCode && (
                      <Tooltip title={refCopied ? 'Copied!' : 'Copy referral link'} arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } }, arrow: { sx: { color: t.bg.tooltip } } }}>
                        <Box
                          component="button"
                          onClick={handleShareReferral}
                          sx={{
                            background: 'none', border: 'none', cursor: 'pointer', p: 0,
                            display: 'flex', alignItems: 'center', flexShrink: 0,
                            color: refCopied ? t.gain : t.text.dimmed,
                            '&:hover': { color: t.accent },
                            transition: 'color 0.15s',
                          }}
                        >
                          {refCopied ? <CheckCircle sx={{ fontSize: 13 }} /> : <Share sx={{ fontSize: 13 }} />}
                        </Box>
                      </Tooltip>
                    )}
                  </Box>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: t.text.soft, mb: 0.5 }}>
                    {userProfile ? `LVL ${userProfile.level}: ${userProfile.title}` : ''}
                  </Typography>
                  {userProfile && (
                    <Box sx={{ width: '100%' }}>
                      <Box sx={{ width: '100%', height: 8, borderRadius: 4, bgcolor: t.border.default, overflow: 'hidden' }}>
                        <Box sx={{ width: `${Math.max(0, Math.min(100, (userProfile.xpProgress || 0) * 100))}%`, height: '100%', borderRadius: 4, bgcolor: t.accent }} />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.text.quaternary }}>
                          XP {(Number(userProfile.totalXp) - Number(userProfile.xpForCurrentLevel)).toLocaleString()}/{(Number(userProfile.xpForNextLevel) - Number(userProfile.xpForCurrentLevel)).toLocaleString()}
                        </Typography>
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.text.muted }}>
                          {userProfile.level >= 40 ? 'MAX' : `${userProfile.level + 1} LVL`}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </Box>
              </Box>

              {/* ── Card 2: Balance ── */}
              <Box sx={{ bgcolor: t.hover.light, borderRadius: 1, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mb: 0.25 }}>
                    <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: t.text.tertiary }}>Your funds</Typography>
                    <Tooltip title="Your current USDC balance on Solana" arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } }, arrow: { sx: { color: t.bg.tooltip } } }}>
                      <InfoOutlined sx={{ fontSize: 11, color: t.border.emphasis, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
                    </Tooltip>
                  </Box>
                  <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                    $ {balance ? balance.uiAmount.toFixed(2) : '0.00'}
                  </Typography>
                </Box>
              </Box>

              {/* ── Card 3: UP Coins ── */}
              <Box sx={{ bgcolor: t.hover.light, borderRadius: 1, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mb: 0.25 }}>
                    <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: t.text.tertiary }}>UP Coins</Typography>
                    <Tooltip title="Coins earned from winning bets. Will convert to $UP tokens at launch" arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } }, arrow: { sx: { color: t.bg.tooltip } } }}>
                      <InfoOutlined sx={{ fontSize: 11, color: t.border.emphasis, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
                    </Tooltip>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box component="img" src="/token/Token_16px_Gold.png" alt="UP" sx={{ width: { xs: 14, md: 18 }, height: { xs: 14, md: 18 } }} />
                    <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: t.accent, fontVariantNumeric: 'tabular-nums' }}>
                      {userProfile ? (Number(userProfile.coinsBalance) / UP_COINS_DIVISOR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* ── Card 4: Predictions ── */}
              <Box sx={{ bgcolor: t.hover.light, borderRadius: 1, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mb: 0.25 }}>
                    <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: t.text.tertiary }}>Predictions</Typography>
                    <Tooltip title="Total number of bets you have placed" arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } }, arrow: { sx: { color: t.bg.tooltip } } }}>
                      <InfoOutlined sx={{ fontSize: 11, color: t.border.emphasis, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
                    </Tooltip>
                  </Box>
                  <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                    {userProfile?.stats.totalBets ?? totalBets}
                  </Typography>
                </Box>
              </Box>

              {/* ── Card 5: Win / Loss ── */}
              <Box sx={{ bgcolor: t.hover.light, borderRadius: 1, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mb: 0.25 }}>
                    <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: t.text.tertiary }}>Win / Loss</Typography>
                    <Tooltip title="Total wins vs losses. Refunded pools are not counted" arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } }, arrow: { sx: { color: t.bg.tooltip } } }}>
                      <InfoOutlined sx={{ fontSize: 11, color: t.border.emphasis, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
                    </Tooltip>
                  </Box>
                  <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    <Box component="span" sx={{ color: t.gain }}>{wonCount}</Box>
                    <Box component="span" sx={{ color: t.text.dimmed, mx: 0.5 }}>/</Box>
                    <Box component="span" sx={{ color: t.down }}>{lostCount}</Box>
                  </Typography>
                </Box>
              </Box>

              {/* ── Card 6: Total Staked ── */}
              <Box sx={{ bgcolor: t.hover.light, borderRadius: 1, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mb: 0.25 }}>
                    <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: t.text.tertiary }}>Total Staked</Typography>
                    <Tooltip title="Total USDC you have deposited across all pools" arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } }, arrow: { sx: { color: t.bg.tooltip } } }}>
                      <InfoOutlined sx={{ fontSize: 11, color: t.border.emphasis, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
                    </Tooltip>
                  </Box>
                  <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                    ${(totalStaked / USDC_DIVISOR).toFixed(0)}
                  </Typography>
                </Box>
              </Box>

              {/* ── Card 7: Total Won ── */}
              <Box sx={{ bgcolor: t.hover.light, borderRadius: 1, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mb: 0.25 }}>
                    <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: t.text.tertiary }}>Total Won</Typography>
                    <Tooltip title="Total USDC received from winning predictions after fees" arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } }, arrow: { sx: { color: t.bg.tooltip } } }}>
                      <InfoOutlined sx={{ fontSize: 11, color: t.border.emphasis, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
                    </Tooltip>
                  </Box>
                  <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: t.gain, fontVariantNumeric: 'tabular-nums' }}>
                    ${(totalPayout / USDC_DIVISOR).toFixed(0)}
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}
        </Container>
      </Box>
    </>
  );
}
