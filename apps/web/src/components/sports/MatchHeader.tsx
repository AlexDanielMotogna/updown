'use client';

/**
 * Kalshi-style match identity header for /match/[id].
 *
 * Layout:
 *   [colored league tile]   [STATUS] · SPORTS · {SPORT} · {LEAGUE}   [share icons]
 *                           {Home} vs {Away}                          (big title)
 *
 * Replaces the legacy back-arrow + small chip + status-flags row that was
 * cramming five pieces of state into one strip. The status here is a tiny
 * inline pill alongside the breadcrumbs; the bigger LIVE indicator + score
 * live in MatchScoreRow below this component.
 */

import { useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { BookmarkBorder, CheckCircle, Code, Link as LinkIcon } from '@mui/icons-material';
import type { ComponentType } from 'react';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface Props {
  /** Top-level status word - "LIVE", "REG TIME", "FT", "KICKOFF" etc. */
  statusLabel: string;
  /** Tints the dot + status word; use the gain color for live, muted for over. */
  statusColor: string;
  /** Pulse the dot for live states. */
  statusPulse?: boolean;
  /** Breadcrumb segments after the status word ("SPORTS", "Soccer", "Brazilian Serie A"). */
  breadcrumbs: string[];
  /** Main title (Home vs Away, or PM question). */
  title: string;
  /** League badge URL - falls back to icon when missing. */
  leagueBadgeUrl?: string | null;
  /** Optional icon for leagues without an artwork (PM categories, etc). */
  leagueIcon?: ComponentType<{ sx?: object }> | null;
  /** Tile background tint, defaults to surface. */
  tileBg?: string;
  /** When the league badge has light artwork on a transparent ground we pad
   *  it so it reads against the tile. */
  padBadge?: boolean;
  /** PM question thumbnails are designed to be edge-to-edge photos; pass
   *  this so the image covers the whole tile instead of the 78%-contain
   *  treatment we use for crest-style league badges. */
  fillBadge?: boolean;
}

export function MatchHeader({
  statusLabel,
  statusColor,
  statusPulse = false,
  breadcrumbs,
  title,
  leagueBadgeUrl,
  leagueIcon: LeagueIcon,
  tileBg,
  padBadge,
  fillBadge,
}: Props) {
  const t = useThemeTokens();
  const [copied, setCopied] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.25, md: 1.75 }, minWidth: 0 }}>
        {/* Colored league tile - matches the asset tile on /pool/[id]. */}
        <Box
          sx={{
            width: { xs: 48, md: 60 },
            height: { xs: 48, md: 60 },
            borderRadius: 1.5,
            bgcolor: tileBg ?? t.bg.surfaceAlt,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {leagueBadgeUrl ? (
            <Box
              component="img"
              src={leagueBadgeUrl}
              alt=""
              sx={fillBadge ? {
                // PM question thumb: cover the whole tile edge-to-edge.
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              } : {
                // League badge / crest: contained with slight breathing room.
                width: '78%',
                height: '78%',
                objectFit: 'contain',
                ...(padBadge && { p: '4px' }),
              }}
            />
          ) : LeagueIcon ? (
            <LeagueIcon sx={{ fontSize: { xs: 28, md: 34 }, color: t.text.primary }} />
          ) : null}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          {/* Breadcrumb row: pulsing status dot + status word + crumbs */}
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mb: 0.25 }}>
            {statusLabel && (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
                {statusPulse && (
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: statusColor,
                      animation: 'matchHeaderPulse 1.5s infinite',
                      '@keyframes matchHeaderPulse': {
                        '0%,100%': { opacity: 1, transform: 'scale(1)' },
                        '50%': { opacity: 0.45, transform: 'scale(0.85)' },
                      },
                    }}
                  />
                )}
                <Typography
                  sx={{
                    fontSize: { xs: '0.65rem', md: '0.72rem' },
                    fontWeight: 800,
                    color: statusColor,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    lineHeight: 1,
                  }}
                >
                  {statusLabel}
                </Typography>
              </Box>
            )}
            {breadcrumbs.map((crumb, i) => (
              <Box key={`${crumb}-${i}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: { xs: '0.62rem', md: '0.68rem' }, fontWeight: 700, color: t.text.tertiary }}>
                  ·
                </Typography>
                <Typography
                  sx={{
                    fontSize: { xs: '0.65rem', md: '0.72rem' },
                    fontWeight: 700,
                    color: t.text.tertiary,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    lineHeight: 1,
                  }}
                >
                  {crumb}
                </Typography>
              </Box>
            ))}
          </Box>
          {/* Title */}
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
        </Box>
      </Box>

      {/* Share / embed / bookmark - same set as PoolPageHeader so the two
          surfaces read as one family. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0, mt: { xs: 0.25, md: 0.5 } }}>
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
              '&:hover': { color: t.text.primary, bgcolor: withAlpha(t.text.primary, 0.05) },
            }}
          >
            {copied ? <CheckCircle sx={{ fontSize: 18 }} /> : <LinkIcon sx={{ fontSize: 18 }} />}
          </Box>
        </Tooltip>
        <Tooltip title={bookmarked ? 'Bookmarked' : 'Bookmark'} arrow placement="bottom">
          <Box
            component="button"
            onClick={() => setBookmarked((b) => !b)}
            sx={{
              p: 0.75,
              borderRadius: 1,
              border: 'none',
              bgcolor: 'transparent',
              color: bookmarked ? t.accent : t.text.tertiary,
              cursor: 'pointer',
              display: 'flex',
              transition: 'color 0.15s, background 0.15s',
              '&:hover': { color: t.text.primary, bgcolor: withAlpha(t.text.primary, 0.05) },
            }}
          >
            <BookmarkBorder sx={{ fontSize: 18 }} />
          </Box>
        </Tooltip>
      </Box>
    </Box>
  );
}
