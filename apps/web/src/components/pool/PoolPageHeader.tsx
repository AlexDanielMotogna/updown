'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Tooltip } from '@mui/material';
import { Code, Link as LinkIcon, BookmarkBorder, CheckCircle, ChevronRight } from '@mui/icons-material';
import { AssetIcon } from '@/components/AssetIcon';
import { formatPredictionWindow } from '@/lib/format';
import { INTERVAL_LABELS } from '@/lib/constants';
import { getAssetName } from '@/lib/assets';
import { usePools } from '@/hooks';
import { useThemeTokens } from '@/app/providers';

interface PoolPageHeaderProps {
  asset: string;
  interval: string;
  startTime: string;
  endTime: string;
  /** Used to scope the "next pool" lookup — picks the JOINING pool with
   *  the same asset+interval whose startTime sits right after this one. */
  poolId: string;
}

/**
 * Polymarket-style pool header: colored asset tile + "Bitcoin Up or Down 5m"
 * title + window subtitle + share/embed/bookmark actions on the right.
 *
 * Bookmark is local-only for now (sessionStorage) - wiring it to a real
 * server-side favourite is a separate concern.
 */
export function PoolPageHeader({ asset, interval, startTime, endTime, poolId }: PoolPageHeaderProps) {
  const t = useThemeTokens();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const intervalLabel = INTERVAL_LABELS[interval] || interval;
  const title = `${getAssetName(asset)} Up or Down ${intervalLabel}`;

  // Polymarket-style "next pool" navigation: hop straight to the upcoming
  // pool for the same asset+interval. We reuse the same /pools query the
  // right-rail sidebar fires, so this is a cache hit and adds no extra
  // request. JOINING-only because ACTIVE pools have already started — the
  // "next" the user wants is the one that opens after this one closes.
  const { data: poolsData } = usePools({
    type: 'CRYPTO',
    status: 'JOINING',
    limit: 30,
  });
  const nextPool = useMemo(() => {
    const all = poolsData?.data ?? [];
    const currentStart = new Date(startTime).getTime();
    const candidates = all
      .filter(p => p.id !== poolId)
      .filter(p => p.asset === asset && p.interval === interval)
      .filter(p => new Date(p.startTime).getTime() > currentStart)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return candidates[0] ?? null;
  }, [poolsData, poolId, asset, interval, startTime]);

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleNext = () => {
    if (!nextPool) return;
    router.push(`/pool/${nextPool.id}`);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 2,
        px: { xs: 2, md: 3 },
        py: { xs: 1.5, md: 2 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
        {/* Asset icon - Pacifica SVG already comes round with its own brand
            background, no need to wrap it in another colored circle. */}
        <Box sx={{ flexShrink: 0 }}>
          <AssetIcon asset={asset} size={56} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: { xs: '1.05rem', md: '1.4rem' },
              fontWeight: 800,
              color: t.text.primary,
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </Typography>
          <Typography
            suppressHydrationWarning
            sx={{
              fontSize: { xs: '0.72rem', md: '0.82rem' },
              fontWeight: 500,
              color: t.text.tertiary,
              mt: 0.25,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {formatPredictionWindow(startTime, endTime)}
          </Typography>
        </Box>
      </Box>

      {/* Share / embed / bookmark - mirror the icons in the Polymarket header. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0, mt: { xs: 0.5, md: 1 } }}>
        {/* "Next pool" — jumps to the upcoming pool for the same
            asset+interval. Disabled state (with a different tooltip) is
            kept so the slot doesn't shift around once a new pool gets
            scheduled. */}
        <Tooltip
          title={nextPool ? `Next ${intervalLabel} pool` : 'No upcoming pool yet'}
          arrow
          placement="bottom"
        >
          <Box
            component="button"
            onClick={handleNext}
            disabled={!nextPool}
            sx={{
              p: 0.75,
              borderRadius: 1,
              border: 'none',
              bgcolor: 'transparent',
              color: nextPool ? t.text.tertiary : t.text.quaternary,
              cursor: nextPool ? 'pointer' : 'not-allowed',
              opacity: nextPool ? 1 : 0.5,
              display: 'flex',
              transition: 'color 0.15s, background 0.15s',
              '&:hover': nextPool ? { color: t.text.primary, bgcolor: t.hover.light } : {},
            }}
          >
            <ChevronRight sx={{ fontSize: 20 }} />
          </Box>
        </Tooltip>
        <Tooltip title="Embed widget (coming soon)" arrow placement="bottom">
          <Box
            sx={{
              p: 0.75,
              borderRadius: 1,
              color: t.text.tertiary,
              cursor: 'not-allowed',
              opacity: 0.6,
              display: 'flex',
            }}
          >
            <Code sx={{ fontSize: 18 }} />
          </Box>
        </Tooltip>
        <Tooltip title={copied ? 'Link copied!' : 'Copy link'} arrow placement="bottom">
          <Box
            component="button"
            onClick={handleCopyLink}
            sx={{
              p: 0.75,
              borderRadius: 1,
              border: 'none',
              bgcolor: 'transparent',
              color: copied ? t.gain : t.text.tertiary,
              cursor: 'pointer',
              display: 'flex',
              transition: 'color 0.15s, background 0.15s',
              '&:hover': { color: t.text.primary, bgcolor: t.hover.light },
            }}
          >
            {copied ? <CheckCircle sx={{ fontSize: 18 }} /> : <LinkIcon sx={{ fontSize: 18 }} />}
          </Box>
        </Tooltip>
        <Tooltip title={bookmarked ? 'Bookmarked' : 'Bookmark'} arrow placement="bottom">
          <Box
            component="button"
            onClick={() => setBookmarked(b => !b)}
            sx={{
              p: 0.75,
              borderRadius: 1,
              border: 'none',
              bgcolor: 'transparent',
              color: bookmarked ? t.accent : t.text.tertiary,
              cursor: 'pointer',
              display: 'flex',
              transition: 'color 0.15s, background 0.15s',
              '&:hover': { color: t.text.primary, bgcolor: t.hover.light },
            }}
          >
            <BookmarkBorder sx={{ fontSize: 18 }} />
          </Box>
        </Tooltip>
      </Box>
    </Box>
  );
}
