'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, Box, ClickAwayListener, Fade, IconButton, Popper, Typography } from '@mui/material';
import { NotificationsNone } from '@mui/icons-material';
import { useIdentity } from '@/hooks/useIdentity';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type DbNotification } from '@/lib/api';
import { useThemeTokens } from '@/lib/theme-tokens';

const sevColor = (t: ReturnType<typeof useThemeTokens>, s: string) =>
  s === 'success' ? t.gain : s === 'error' ? t.down : s === 'warning' ? t.warning : t.info;

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
    if (n.read) return;
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    await markNotificationRead(n.id);
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
            <NotificationsNone sx={{ fontSize: 20 }} />
          </Badge>
        </IconButton>

        <Popper open={open} anchorEl={anchorRef.current} placement="bottom-end" transition sx={{ zIndex: 1400, maxWidth: 'calc(100vw - 16px)' }}>
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={150}>
              <Box sx={{ mt: 1, width: 320, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 90px)', overflowY: 'auto', bgcolor: t.bg.surfaceAlt, border: t.surfaceBorder, borderRadius: '8px', boxShadow: t.surfaceShadow, fontFamily: 'inherit' }}>
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
                  items.map((n) => (
                    <Box
                      key={n.id}
                      onClick={() => readOne(n)}
                      sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${t.border.subtle}`, cursor: 'pointer', bgcolor: n.read ? 'transparent' : t.hover.subtle, '&:hover': { bgcolor: t.hover.default } }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: n.read ? 'transparent' : sevColor(t, n.severity), flexShrink: 0 }} />
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: t.text.primary, flex: 1, minWidth: 0 }}>{n.title}</Typography>
                        <Typography sx={{ fontSize: '0.65rem', color: t.text.quaternary }}>{timeAgo(n.createdAt)}</Typography>
                      </Box>
                      <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary, mt: 0.25, pl: 1.75 }}>{n.message}</Typography>
                    </Box>
                  ))
                )}
              </Box>
            </Fade>
          )}
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}
