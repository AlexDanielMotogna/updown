'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, Box, ClickAwayListener, Fade, IconButton, Popper, Typography } from '@mui/material';
import {
  Notifications, EmojiEvents, TrendingDown, AttachMoney,
  CheckCircleOutline, ErrorOutline, WarningAmber, InfoOutlined,
} from '@mui/icons-material';
import { useIdentity } from '@/hooks/useIdentity';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type DbNotification } from '@/lib/api';
import { useThemeTokens } from '@/lib/theme-tokens';

const rawAppUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const APP_URL = /^https?:\/\//.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`;

/** Icon per notification type/severity — mirrors the app's NotificationPanel. */
function NotifIcon({ type, severity, t }: { type: string; severity: string; t: ReturnType<typeof useThemeTokens> }) {
  // UP coins use the actual gold token image (same as markets/header), not a $.
  if (type === 'COINS_EARNED')
    return <Box component="img" src="/token/Token_16px_Gold.png" alt="UP Coin" sx={{ width: 18, height: 18 }} />;
  if (type === 'POOL_WON' || type === 'POOL_CLAIMABLE' || type === 'BET_PAID' || type === 'TOURNAMENT_WON' || type === 'TOURNAMENT_MATCH_WON')
    return <EmojiEvents sx={{ fontSize: 18, color: t.gain }} />;
  if (type === 'POOL_LOST' || type === 'TOURNAMENT_MATCH_LOST')
    return <TrendingDown sx={{ fontSize: 18, color: t.down }} />;
  if (type === 'CLAIM_SUCCESS' || type === 'REFUND_RECEIVED' || type === 'DEPOSIT_SUCCESS' || type === 'TOURNAMENT_ENTRY_PAID')
    return <AttachMoney sx={{ fontSize: 18, color: t.gain }} />;
  switch (severity) {
    case 'success': return <CheckCircleOutline sx={{ fontSize: 18, color: t.gain }} />;
    case 'error': return <ErrorOutline sx={{ fontSize: 18, color: t.down }} />;
    case 'warning': return <WarningAmber sx={{ fontSize: 18, color: t.warning }} />;
    default: return <InfoOutlined sx={{ fontSize: 18, color: t.info }} />;
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Notifications bell — same store as the app (polled). Mirrors its panel look. */
export function NotificationBell() {
  const t = useThemeTokens();
  const { walletAddress } = useIdentity();
  const [items, setItems] = useState<DbNotification[]>([]);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!walletAddress) { setItems([]); return; }
    let alive = true;
    const load = () => fetchNotifications(walletAddress).then((n) => alive && setItems(n));
    load();
    const id = window.setInterval(load, 30_000);
    return () => { alive = false; window.clearInterval(id); };
  }, [walletAddress]);

  if (!walletAddress) return null;
  const unread = items.filter((n) => !n.read).length;

  async function onOpen() {
    setOpen((v) => !v);
  }
  async function readOne(n: DbNotification) {
    if (!n.read) {
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      markNotificationRead(n.id).catch(() => {});
    }
    // Pool/match notifications link back to the app (the terminal has no pool pages).
    if (n.poolId) {
      const path = n.poolType === 'CRYPTO' ? 'pool' : 'match';
      window.open(`${APP_URL}/${path}/${n.poolId}`, '_blank', 'noopener');
      setOpen(false);
    }
  }
  async function readAll() {
    if (!walletAddress) return;
    setItems((cur) => cur.map((x) => ({ ...x, read: true })));
    await markAllNotificationsRead(walletAddress);
  }

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: 'relative' }}>
        <IconButton
          ref={anchorRef}
          onClick={onOpen}
          size="small"
          sx={{ color: t.text.secondary, width: 38, height: 38, borderRadius: '6px', bgcolor: open ? t.hover.strong : 'transparent', '&:hover': { color: t.text.primary, bgcolor: t.hover.default } }}
        >
          <Badge badgeContent={unread} color="error" overlap="circular" sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 16, minWidth: 16 } }}>
            <Notifications sx={{ fontSize: 18, color: open ? t.text.primary : t.text.secondary }} />
          </Badge>
        </IconButton>

        <Popper open={open} anchorEl={anchorRef.current} placement="bottom-end" transition sx={{ zIndex: 1400, maxWidth: 'calc(100vw - 16px)' }}>
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={150}>
              <Box sx={{ mt: 1, width: 320, maxWidth: 'calc(100vw - 16px)', bgcolor: t.bg.surfaceAlt, border: t.surfaceBorder, borderRadius: '8px', boxShadow: t.surfaceShadow, fontFamily: 'inherit', overflow: 'hidden' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: `1px solid ${t.border.default}` }}>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary }}>Notifications</Typography>
                  {unread > 0 && (
                    <Typography onClick={readAll} sx={{ fontSize: '0.72rem', color: t.up, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
                      Mark all read
                    </Typography>
                  )}
                </Box>
                {items.length === 0 ? (
                  <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '0.8rem', color: t.text.tertiary }}>No notifications</Typography>
                  </Box>
                ) : (
                  // Fixed-height scroll list (header stays put) — like the app's markets panel.
                  <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
                    {items.map((n) => (
                      <Box
                        key={n.id}
                        onClick={() => readOne(n)}
                        sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, px: 2, py: 1.25, borderBottom: `1px solid ${t.border.subtle}`, cursor: n.poolId ? 'pointer' : 'default', bgcolor: n.read ? 'transparent' : t.hover.subtle, '&:hover': { bgcolor: t.hover.default } }}
                      >
                        <Box sx={{ pt: 0.25, flexShrink: 0 }}>
                          <NotifIcon type={n.type} severity={n.severity} t={t} />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</Typography>
                            <Typography sx={{ fontSize: '0.65rem', color: t.text.quaternary, flexShrink: 0 }}>{timeAgo(n.createdAt)}</Typography>
                          </Box>
                          <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary, mt: 0.25, lineHeight: 1.4 }}>{n.message}</Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </Fade>
          )}
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}
