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
  Notifications,
  CheckCircleOutline,
  ErrorOutline,
  WarningAmber,
  InfoOutlined,
  EmojiEvents,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { useNotificationStore, type Notification, type NotificationSeverity } from '@/stores/notificationStore';
import { AssetIcon } from '../AssetIcon';
import { UserLevelBadge } from '../UserLevelBadge';
import { GAIN_COLOR, ACCENT_COLOR, DOWN_COLOR } from '@/lib/constants';

const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  success: GAIN_COLOR,
  info: ACCENT_COLOR,
  warning: ACCENT_COLOR,
  error: DOWN_COLOR,
};

function getSeverityIcon(severity: NotificationSeverity, type: string) {
  if (type === 'POOL_WON' || type === 'POOL_CLAIMABLE')
    return <EmojiEvents sx={{ fontSize: 18, color: GAIN_COLOR }} />;
  if (type === 'TOURNAMENT_ENTRY_PAID' || type === 'DEPOSIT_SUCCESS')
    return <Typography sx={{ fontSize: 16, fontWeight: 800, color: GAIN_COLOR, width: 18, textAlign: 'center' }}>$</Typography>;
  if (type === 'CLAIM_SUCCESS' || type === 'REFUND_RECEIVED')
    return <Box component="img" src="/coins/usdc-coin.png" alt="USDC" sx={{ width: 18, height: 18 }} />;
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

export function NotificationPanel() {
  const router = useRouter();
  const notifications = useNotificationStore((s) => s.notifications);
  const dismissAll = useNotificationStore((s) => s.dismissAll);
  const dismiss = useNotificationStore((s) => s.dismiss);

  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  const handleBellClick = useCallback(() => {
    setBellOpen((prev) => {
      if (!prev) {
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

  const badgeCount = notifications.filter((n) => !n.dismissed && !seenIds.has(n.id)).length;

  return (
    <ClickAwayListener onClickAway={handleBellClose}>
      <Box sx={{ position: 'relative' }}>
        <IconButton
          ref={bellRef}
          size="small"
          onClick={handleBellClick}
          sx={{
            bgcolor: bellOpen ? 'rgba(255,255,255,0.08)' : 'transparent',
            borderRadius: '6px',
            width: { xs: 34, sm: 38 },
            height: { xs: 34, sm: 38 },
            '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
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
                          {n.type === 'LEVEL_UP' && n.level ? (
                            <UserLevelBadge level={n.level} title="" size="sm" variant="icon-only" />
                          ) : n.type === 'COINS_EARNED' ? (
                            <Box component="img" src="/token/Token_16px_Gold.png" alt="UP Coin" sx={{ width: 18, height: 18 }} />
                          ) : (n.type === 'DEPOSIT_SUCCESS' || n.type === 'TOURNAMENT_ENTRY_PAID') ? (
                            getSeverityIcon(n.severity, n.type)
                          ) : n.type.startsWith('TOURNAMENT_') && n.asset ? (
                            n.asset.includes(':') ? (
                              <Box component="img" src={`https://crests.football-data.org/${n.asset.split(':')[1]}.png`} alt="" sx={{ width: 22, height: 22, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '2px' }} />
                            ) : (
                              <Box component="img" src={`/tournaments/tournament-${n.asset.toLowerCase()}.png`} alt={n.asset} sx={{ width: 22, height: 22, objectFit: 'contain' }} />
                            )
                          ) : n.asset && !n.asset.includes(':') ? (
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
  );
}
