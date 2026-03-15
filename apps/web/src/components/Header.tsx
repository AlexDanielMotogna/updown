'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Badge,
  IconButton,
  ClickAwayListener,
  Popper,
  Fade,
} from '@mui/material';
import {
  ShowChart,
  WorkOutline,
  Notifications,
  AttachMoney,
  CheckCircleOutline,
  ErrorOutline,
  WarningAmber,
  InfoOutlined,
  EmojiEvents,
  Close,
} from '@mui/icons-material';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ConnectWalletButton } from './ConnectWalletButton';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { UP_COLOR, GAIN_COLOR, ACCENT_COLOR, DOWN_COLOR } from '@/lib/constants';
import { useNotificationStore, type Notification, type NotificationSeverity } from '@/stores/notificationStore';
import { AssetIcon } from './AssetIcon';
import { UserLevelBadge } from './UserLevelBadge';
import { UpCoinsBalance } from './UpCoinsBalance';

const NAV_ITEMS = [
  { label: 'Markets', href: '/', icon: ShowChart },
  { label: 'Portfolio', href: '/bets', icon: WorkOutline },
  { label: 'Leaderboard', href: '/leaderboard', icon: EmojiEvents },
];

const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  success: GAIN_COLOR,
  info: ACCENT_COLOR,
  warning: ACCENT_COLOR,
  error: DOWN_COLOR,
};

function getSeverityIcon(severity: NotificationSeverity, type: string) {
  if (type === 'POOL_WON' || type === 'POOL_CLAIMABLE')
    return <EmojiEvents sx={{ fontSize: 18, color: GAIN_COLOR }} />;
  switch (severity) {
    case 'success': return <CheckCircleOutline sx={{ fontSize: 18, color: GAIN_COLOR }} />;
    case 'info': return <InfoOutlined sx={{ fontSize: 18, color: ACCENT_COLOR }} />;
    case 'warning': return <WarningAmber sx={{ fontSize: 18, color: ACCENT_COLOR }} />;
    case 'error': return <ErrorOutline sx={{ fontSize: 18, color: DOWN_COLOR }} />;
  }
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const { data: userProfile } = useUserProfile();

  const notifications = useNotificationStore((s) => s.notifications);
  const dismissAll = useNotificationStore((s) => s.dismissAll);
  const dismiss = useNotificationStore((s) => s.dismiss);

  const unreadCount = notifications.filter((n) => !n.dismissed).length;

  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  // Track which notifications the user has "seen" (opened the panel while they existed)
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  const handleBellClick = useCallback(() => {
    setBellOpen((prev) => {
      if (!prev) {
        // Mark all current notifications as seen when opening
        setSeenIds(new Set(notifications.map((n) => n.id)));
      }
      return !prev;
    });
  }, [notifications]);

  const handleBellClose = useCallback(() => {
    setBellOpen(false);
  }, []);

  const handleNotifClick = useCallback(
    (n: Notification) => {
      if (n.poolId) {
        router.push(`/pool/${n.poolId}`);
        setBellOpen(false);
      }
    },
    [router],
  );

  // Badge shows count of notifications not yet seen in the panel
  const badgeCount = notifications.filter((n) => !n.dismissed && !seenIds.has(n.id)).length;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: '#0B0F14',
      }}
    >
      {/* Main bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          height: { xs: 56, md: 64 },
          px: { xs: 2, sm: 3, md: 4 },
        }}
      >
        {/* Left: Logo */}
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              letterSpacing: '-0.02em',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <Box component="span" sx={{ color: UP_COLOR }}>
              Up
            </Box>
            <Box component="span" sx={{ color: 'rgba(255, 255, 255, 0.4)' }}>
              Down
            </Box>
          </Typography>
        </Link>

        {/* Desktop nav — centered */}
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            alignItems: 'center',
            gap: 1,
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                <Button
                  sx={{
                    color: active ? '#FFFFFF' : 'text.secondary',
                    px: 2,
                    borderBottom: active ? `2px solid ${UP_COLOR}` : '2px solid transparent',
                    borderRadius: 0,
                    '&:hover': {
                      color: '#FFFFFF',
                      backgroundColor: 'transparent',
                    },
                  }}
                >
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </Box>

        {/* Right: Hellcase-style bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {connected ? (
            <>
              {/* Balance */}
              <Box
                sx={{
                  display: { xs: 'none', sm: 'flex' },
                  alignItems: 'center',
                  gap: 0.75,
                  bgcolor: 'rgba(255,255,255,0.04)',
                  borderRadius: '4px',
                  px: 1.5,
                  height: 36,
                }}
              >
                <AttachMoney sx={{ fontSize: 16, color: GAIN_COLOR }} />
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                  {balance ? balance.uiAmount.toFixed(2) : '0.00'}
                </Typography>
              </Box>

              {/* UP Coins Balance */}
              {userProfile && (
                <Box sx={{ display: { xs: 'none', sm: 'flex' } }}>
                  <UpCoinsBalance balance={userProfile.coinsBalance} />
                </Box>
              )}

              {/* Level Badge */}
              {userProfile && (
                <Box sx={{ display: { xs: 'none', sm: 'flex' } }}>
                  <UserLevelBadge level={userProfile.level} title={userProfile.title} size="sm" />
                </Box>
              )}

              {/* Notifications */}
              <ClickAwayListener onClickAway={handleBellClose}>
                <Box sx={{ position: 'relative' }}>
                  <IconButton
                    ref={bellRef}
                    size="small"
                    onClick={handleBellClick}
                    sx={{
                      bgcolor: bellOpen ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                      borderRadius: '4px',
                      width: 36,
                      height: 36,
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                    }}
                  >
                    <Badge
                      badgeContent={badgeCount}
                      color="error"
                      sx={{
                        '& .MuiBadge-badge': {
                          fontSize: '0.6rem',
                          minWidth: 16,
                          height: 16,
                          display: badgeCount > 0 ? 'flex' : 'none',
                        },
                      }}
                    >
                      <Notifications sx={{ fontSize: 18, color: bellOpen ? '#fff' : 'text.secondary' }} />
                    </Badge>
                  </IconButton>

                  <Popper
                    open={bellOpen}
                    anchorEl={bellRef.current}
                    placement="bottom-end"
                    transition
                    sx={{ zIndex: 1400 }}
                  >
                    {({ TransitionProps }) => (
                      <Fade {...TransitionProps} timeout={150}>
                        <Box
                          sx={{
                            mt: 1,
                            width: { xs: 'calc(100vw - 32px)', sm: 360 },
                            maxHeight: 420,
                            bgcolor: '#0D1219',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                          }}
                        >
                          {/* Panel header */}
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              px: 2,
                              py: 1.5,
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                            }}
                          >
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                              Notifications
                            </Typography>
                            {notifications.length > 0 && (
                              <Button
                                size="small"
                                onClick={() => {
                                  dismissAll();
                                  setBellOpen(false);
                                }}
                                sx={{
                                  fontSize: '0.7rem',
                                  color: 'rgba(255,255,255,0.4)',
                                  textTransform: 'none',
                                  minWidth: 'auto',
                                  px: 1,
                                  '&:hover': { color: 'rgba(255,255,255,0.7)' },
                                }}
                              >
                                Clear all
                              </Button>
                            )}
                          </Box>

                          {/* Notification list */}
                          <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
                            {notifications.length === 0 ? (
                              <Box sx={{ py: 6, textAlign: 'center' }}>
                                <Notifications sx={{ fontSize: 32, color: 'rgba(255,255,255,0.12)', mb: 1 }} />
                                <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)' }}>
                                  No notifications yet
                                </Typography>
                              </Box>
                            ) : (
                              notifications.map((n) => (
                                <Box
                                  key={n.id}
                                  onClick={() => handleNotifClick(n)}
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 1.5,
                                    px: 2,
                                    py: 1.5,
                                    cursor: n.poolId ? 'pointer' : 'default',
                                    borderLeft: `3px solid ${SEVERITY_COLORS[n.severity]}`,
                                    opacity: n.dismissed ? 0.45 : 1,
                                    transition: 'background 0.15s',
                                    '&:hover': n.poolId
                                      ? { bgcolor: 'rgba(255,255,255,0.03)' }
                                      : undefined,
                                    '& + &': {
                                      borderTop: '1px solid rgba(255,255,255,0.04)',
                                    },
                                  }}
                                >
                                  <Box sx={{ pt: 0.25, flexShrink: 0 }}>
                                    {n.asset ? (
                                      <AssetIcon asset={n.asset} size={18} />
                                    ) : (
                                      getSeverityIcon(n.severity, n.type)
                                    )}
                                  </Box>
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                      <Typography
                                        sx={{
                                          fontSize: '0.8rem',
                                          fontWeight: 600,
                                          color: '#fff',
                                          lineHeight: 1.3,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {n.title}
                                      </Typography>
                                      <Typography
                                        sx={{
                                          fontSize: '0.65rem',
                                          color: 'rgba(255,255,255,0.25)',
                                          flexShrink: 0,
                                        }}
                                      >
                                        {timeAgo(n.createdAt)}
                                      </Typography>
                                    </Box>
                                    <Typography
                                      sx={{
                                        fontSize: '0.72rem',
                                        color: 'rgba(255,255,255,0.45)',
                                        lineHeight: 1.4,
                                        mt: 0.25,
                                      }}
                                    >
                                      {n.message}
                                    </Typography>
                                  </Box>
                                </Box>
                              ))
                            )}
                          </Box>
                        </Box>
                      </Fade>
                    )}
                  </Popper>
                </Box>
              </ClickAwayListener>

              {/* Profile avatar */}
              <ConnectWalletButton variant="header" />
            </>
          ) : (
            <ConnectWalletButton variant="header" />
          )}
        </Box>
      </Box>

      {/* Mobile bottom nav — fixed bar */}
      <Box
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          backgroundColor: '#0B0F14',
          justifyContent: 'space-around',
          px: 1,
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none', flex: 1 }}>
              <Button
                fullWidth
                sx={{
                  flexDirection: 'column',
                  gap: 0.25,
                  color: active ? '#FFFFFF' : 'text.secondary',
                  fontWeight: active ? 500 : 400,
                  fontSize: '0.7rem',
                  py: 1,
                  minWidth: 0,
                  borderRadius: 0,
                  textTransform: 'none',
                  '&:hover': {
                    color: '#FFFFFF',
                    backgroundColor: 'transparent',
                  },
                }}
              >
                <Icon sx={{ fontSize: 22 }} />
                {item.label}
              </Button>
            </Link>
          );
        })}
      </Box>

    </Box>
  );
}
