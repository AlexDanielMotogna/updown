'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { USDC_DIVISOR } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';
import { getDisplayName } from '@/lib/userDisplay';

interface BetRow {
  /** Pre-truncated label kept for backwards-compat. New code goes through
   *  the userDisplay helper using walletAddress + displayName instead. */
  wallet: string;
  walletAddress?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  side: string;
  amount: string;
  createdAt: string;
}

interface Props {
  poolId: string;
  /** Cap the list (Polymarket sidebar shows a short feed, not the whole book). */
  limit?: number;
}

/**
 * Polls /api/pools/:id/bets every 5s, surfaces a compact "users that entered"
 * feed for the right sidebar - sits between the Place Bet card and the
 * More Crypto Markets list.
 */
export function PoolActivityList({ poolId, limit = 8 }: Props) {
  const t = useThemeTokens();
  const [bets, setBets] = useState<BetRow[]>([]);
  const knownRef = useRef<Set<string>>(new Set());
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!poolId) {
      setBets([]);
      knownRef.current.clear();
      return;
    }
    let active = true;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    const url = `${apiBase}/api/pools/${poolId}/bets`;
    const tick = async () => {
      try {
        const r = await fetch(url);
        const d = await r.json();
        if (!active || !d.success) return;
        const fresh = new Set<string>();
        for (const b of d.data as BetRow[]) {
          const key = `${b.wallet}-${b.createdAt}`;
          if (!knownRef.current.has(key)) {
            fresh.add(key);
            knownRef.current.add(key);
          }
        }
        setBets(d.data);
        if (fresh.size > 0 && fresh.size <= 5) {
          setFreshKeys(fresh);
          setTimeout(() => setFreshKeys(new Set()), 2000);
        }
      } catch {
        /* swallow - next tick will retry */
      }
    };
    tick();
    const iv = setInterval(tick, 5000);
    return () => { active = false; clearInterval(iv); };
  }, [poolId]);

  if (bets.length === 0) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography
        sx={{
          fontSize: '0.62rem',
          fontWeight: 700,
          color: t.text.quaternary,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          mb: 1,
          px: 0.5,
        }}
      >
        Recent activity
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <AnimatePresence initial={false}>
          {bets.slice(0, limit).map(b => {
            const key = `${b.wallet}-${b.createdAt}`;
            const isFresh = freshKeys.has(key);
            const sideColor = b.side === 'UP' ? t.up : t.down;
            const amt = (Number(b.amount) / USDC_DIVISOR).toFixed(2);
            const ago = Math.floor((Date.now() - new Date(b.createdAt).getTime()) / 60000);
            const when = ago < 1 ? 'now' : ago < 60 ? `${ago}m` : `${Math.floor(ago / 60)}h`;
            return (
              <motion.div
                key={key}
                initial={isFresh ? { opacity: 0, y: -6 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                layout
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.6,
                    px: 0.5,
                  }}
                >
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: t.text.tertiary, width: 70, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.walletAddress
                      ? getDisplayName({ walletAddress: b.walletAddress, displayName: b.displayName })
                      : b.wallet}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: sideColor, flexShrink: 0, width: 38 }}>
                    {b.side}
                  </Typography>
                  <Typography sx={{ flex: 1, textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                    ${amt}
                  </Typography>
                  <Typography sx={{ fontSize: '0.66rem', fontWeight: 500, color: t.text.muted, width: 24, textAlign: 'right', flexShrink: 0 }}>
                    {when}
                  </Typography>
                </Box>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </Box>
    </Box>
  );
}
