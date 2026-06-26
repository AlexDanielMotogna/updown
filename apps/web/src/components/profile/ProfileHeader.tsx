'use client';

import {
  Box,
  Container,
  Typography,
  Avatar,
  Skeleton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
} from '@mui/material';
import {
  ContentCopy,
  CheckCircle,
  Share,
  EmojiEvents,
  AccountBalanceWallet,
  Edit,
  Settings,
  VpnKey,
} from '@mui/icons-material';
import { useState } from 'react';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { ConnectWalletButton } from '@/components';
import { UserLevelBadge } from '@/components/UserLevelBadge';
import { XpProgressBar } from '@/components/XpProgressBar';
import { getAvatarUrl } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { UserProfile } from '@/lib/api';
import { EditProfileDialog } from './EditProfileDialog';
import { LevelMilestones } from './LevelMilestones';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function tooltipSlotProps(t: ReturnType<typeof useThemeTokens>) {
  return {
    tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } },
    arrow: { sx: { color: t.bg.tooltip } },
  } as const;
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
  const { isEmbedded, exportWallet } = useWalletBridge();
  const [copied, setCopied] = useState(false);
  const [refCopied, setRefCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const [exporting, setExporting] = useState(false);

  // Self-custody: only the app-created (embedded) wallet can export a key.
  const handleExport = async () => {
    setSettingsAnchor(null);
    setExporting(true);
    try { await exportWallet(); } catch { /* user closed the secure modal */ }
    finally { setExporting(false); }
  };

  // The user's self-edited identity always wins over the wallet-derived
  // defaults. Keeping fallbacks here (truncated wallet + DiceBear gradient
  // + empty banner png) means a new wallet without any customisation still
  // renders the same way it did before this feature shipped.
  const customDisplayName = userProfile?.displayName?.trim() || null;
  const customAvatarUrl = userProfile?.avatarUrl?.trim() || null;
  const customBannerUrl = userProfile?.bannerUrl?.trim() || null;
  const displayedName = customDisplayName
    ?? (walletAddress ? truncateAddress(walletAddress) : '');
  const displayedAvatar = customAvatarUrl
    ?? (walletAddress ? getAvatarUrl(walletAddress) : '');
  const bannerImage = customBannerUrl
    ? `url(${customBannerUrl})`
    : 'url(/Banner/bannerr-empty.png)';

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

  // ── Derived metrics ──
  // (The four north-star stats moved to ProfileStatsPanel beside the chart;
  //  the header now shows the level-milestone strip instead.)
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
          {/* ─── Banner - lives inside the same container so its edges line up
              exactly with the content below (no overhang) ─── */}
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              height: { xs: 120, sm: 150, md: 180 },
              borderRadius: 2,
              backgroundImage: bannerImage,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              backgroundColor: t.bg.app,
            }}
          >
            {connected && walletAddress && (
              <Tooltip title="Edit profile" arrow placement="left" slotProps={tooltipSlotProps(t)}>
                <Box
                  component="button"
                  onClick={() => setEditOpen(true)}
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1.25,
                    py: 0.5,
                    borderRadius: '999px',
                    border: 'none',
                    bgcolor: 'rgba(0,0,0,0.55)',
                    color: '#fff',
                    fontFamily: 'inherit',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backdropFilter: 'blur(4px)',
                    transition: 'background 0.15s, transform 0.05s',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                    '&:active': { transform: 'translateY(1px)' },
                  }}
                >
                  <Edit sx={{ fontSize: 14 }} />
                  Edit
                </Box>
              </Tooltip>
            )}
          </Box>
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
              {/* position:relative + z-index here are *required* because the
                  banner is now position:relative too (it hosts the absolute
                  Edit pill). Without an explicit positioning context on this
                  row, the banner - a positioned earlier sibling - paints on
                  top in the same stacking context and the displayName /
                  wallet got visually buried behind the banner image. */}
              <Box
                sx={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: { xs: 'flex-start', sm: 'flex-end' },
                  gap: { xs: 1.5, md: 2 },
                  mt: { xs: -4, md: -5 },
                  flexWrap: { xs: 'wrap', md: 'nowrap' },
                }}
              >
                {/* Avatar with level ring + badge */}
                <Box sx={{ position: 'relative', flexShrink: 0 }}>
                  {walletAddress ? (
                    <Avatar
                      src={displayedAvatar}
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
                    <Typography sx={{ fontSize: { xs: '0.95rem', md: '1.4rem' }, fontWeight: 700, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayedName}
                    </Typography>
                    <Tooltip
                      title={copied ? 'Copied!' : (walletAddress ? truncateAddress(walletAddress) : '')}
                      arrow
                      placement="bottom"
                      slotProps={tooltipSlotProps(t)}
                    >
                      <Box component="button" onClick={handleCopy} sx={{ background: 'none', border: 'none', cursor: 'pointer', p: 0, display: 'flex', alignItems: 'center', flexShrink: 0, color: copied ? t.gain : t.text.dimmed, '&:hover': { color: t.text.primary } }}>
                        {copied ? <CheckCircle sx={{ fontSize: 15 }} /> : <ContentCopy sx={{ fontSize: 15 }} />}
                      </Box>
                    </Tooltip>
                    {isEmbedded && (
                      <>
                        <Tooltip title="Wallet settings" arrow placement="bottom" slotProps={tooltipSlotProps(t)}>
                          <Box component="button" onClick={(e) => setSettingsAnchor(e.currentTarget)} sx={{ background: 'none', border: 'none', cursor: 'pointer', p: 0, display: 'flex', alignItems: 'center', flexShrink: 0, color: settingsAnchor ? t.text.primary : t.text.dimmed, '&:hover': { color: t.text.primary } }}>
                            <Settings sx={{ fontSize: 15 }} />
                          </Box>
                        </Tooltip>
                        <Menu
                          anchorEl={settingsAnchor}
                          open={Boolean(settingsAnchor)}
                          onClose={() => setSettingsAnchor(null)}
                          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                          slotProps={{ paper: { sx: { bgcolor: t.bg.surface, border: `1px solid ${t.border.medium}`, boxShadow: t.surfaceShadow, mt: 0.5 } } }}
                        >
                          <MenuItem onClick={handleExport} disabled={exporting} sx={{ fontSize: '0.85rem', gap: 1 }}>
                            <ListItemIcon sx={{ minWidth: 'auto !important', color: t.text.secondary }}><VpnKey sx={{ fontSize: 17 }} /></ListItemIcon>
                            {exporting ? 'Opening…' : 'Export wallet'}
                          </MenuItem>
                        </Menu>
                      </>
                    )}
                  </Box>

                  {/* Meta line: only the rank chip when the user has a display
                      name (level info is already on the avatar badge, and the
                      wallet lives behind the copy icon's tooltip). For unedited
                      profiles we still show "Lv.{N} title" so they don't feel
                      empty before the user has customised anything. */}
                  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: { xs: 0.75, md: 1.25 }, mt: 0.5 }}>
                    {!customDisplayName && (
                      <Typography sx={{ fontSize: { xs: '0.8rem', md: '0.9rem' }, fontWeight: 700, color: ringColor, lineHeight: 1.2 }}>
                        Lv.{level} {userProfile?.title ?? ''}
                      </Typography>
                    )}
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

                {/* Actions: balance pill + share. On mobile they drop to their
                    own full-width row (instead of squeezing/wrapping mid-line). */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, width: { xs: '100%', md: 'auto' }, mt: { xs: 0.5, md: 0 }, pb: { xs: 0, sm: 0.5 } }}>
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

              {/* ─── Level milestones (locked/unlocked by level) ─── */}
              <Box sx={{ py: { xs: 2, md: 2.5 } }}>
                <LevelMilestones userProfile={userProfile} />
              </Box>
            </>
          )}
        </Container>
      </Box>
      {walletAddress && (
        <EditProfileDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          walletAddress={walletAddress}
          profile={userProfile}
        />
      )}
    </>
  );
}
