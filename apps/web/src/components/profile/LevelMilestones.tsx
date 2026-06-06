'use client';

import { Box, Tooltip, Typography } from '@mui/material';
import { LockOutlined } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { UserProfile } from '@/lib/api';

// Tier artwork in /public/Level, one image per 4-level band (tiers 0-9).
const LEVEL_ICONS = [
  '/Level/Level_1-4.png',
  '/Level/Level_5-8.png',
  '/Level/Level_9-12.png',
  '/Level/Level_13-16.png',
  '/Level/Level_17-20.png',
  '/Level/Level_21-24.png',
  '/Level/Level_25-28.png',
  '/Level/Level_29-32.png',
  '/Level/Level_33-36.png',
  '/Level/Level_37-40.png',
];

interface LevelMilestonesProps {
  userProfile: UserProfile | null | undefined;
}

// The tooltip box stays dark in both themes, so its text uses fixed
// light-on-dark colours (theme text tokens flip to dark in light mode and
// would vanish against the dark tooltip).
const TT_MUTED = 'rgba(255,255,255,0.6)';
const TT_TEXT = 'rgba(255,255,255,0.95)';
const TT_BORDER = 'rgba(255,255,255,0.12)';
const TT_GOOD = '#4ade80';

/** One label/value row inside a milestone tooltip. */
function MetaRow({ label, value, valueColor }: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2.5, py: 0.2 }}>
      <Typography sx={{ fontSize: '0.7rem', color: TT_MUTED }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: valueColor ?? TT_TEXT, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Box>
  );
}

/**
 * Lock/unlock strip showing the 9 level milestones the server returns in
 * `userProfile.milestones`. Each card carries the level number, the title
 * earned at that level, the lifetime XP required, plus the perks unlocked
 * (lower fee + higher coin multiplier). Locked tiers render desaturated
 * with a padlock; unlocked tiers light up with the user's tier colour.
 *
 * Server is the source of truth for which tiers are unlocked - see
 * serializeUserProfile in apps/api/src/utils/serializers.ts - so a tuning
 * pass on the XP curve or fee table updates both sides without a UI bump.
 */
export function LevelMilestones({ userProfile }: LevelMilestonesProps) {
  const t = useThemeTokens();
  const milestones = userProfile?.milestones ?? [];

  if (milestones.length === 0) {
    return (
      <Typography sx={{ fontSize: '0.8rem', color: t.text.tertiary }}>
        Connect your wallet to see your unlock progress.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        // Desktop: the 9 tiers fit in a single grid row. Mobile: they don't,
        // so swap to a horizontal scroll slider (scrollbar already hidden
        // globally in providers). Each badge keeps a fixed width and never
        // shrinks, so the row scrolls instead of squashing.
        display: { xs: 'flex', md: 'grid' },
        gridTemplateColumns: { md: 'repeat(9, 1fr)' },
        gap: { xs: 1.5, md: 1.25 },
        overflowX: { xs: 'auto', md: 'visible' },
        flexWrap: 'nowrap',
        scrollSnapType: { xs: 'x proximity', md: 'none' },
        WebkitOverflowScrolling: 'touch',
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      {milestones.map((m) => {
        // Pick a colour from the existing 10-stop level tier palette so
        // the milestones strip lives in the same visual language as the
        // avatar ring + level badge - no new accent colours introduced.
        const tierIndex = Math.min(Math.floor((m.level - 1) / 4), 9);
        const tierColor = t.levelTiers[tierIndex];
        const titleColor = m.unlocked ? t.text.primary : t.text.tertiary;

        return (
          <Tooltip
            key={m.level}
            arrow
            placement="top"
            slotProps={{
              tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, borderRadius: 1.5, p: 1.25, maxWidth: 200 } },
              arrow: { sx: { color: t.bg.tooltip } },
            }}
            title={
              <Box sx={{ minWidth: 150 }}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: m.unlocked ? tierColor : TT_TEXT, lineHeight: 1.2 }}>
                  {m.title}
                </Typography>
                <Typography sx={{ fontSize: '0.66rem', fontWeight: 600, color: TT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.75 }}>
                  Level {m.level}
                </Typography>
                <Box sx={{ borderTop: `1px solid ${TT_BORDER}`, pt: 0.6 }}>
                  <MetaRow label="Status" value={m.unlocked ? 'Unlocked' : 'Locked'} valueColor={m.unlocked ? TT_GOOD : TT_TEXT} />
                  {!m.unlocked && (
                    <MetaRow label="XP required" value={Number(m.xpRequired).toLocaleString()} />
                  )}
                  <MetaRow label="Trading fee" value={`${m.feePercent}%`} />
                  <MetaRow label="Coin bonus" value={`${m.coinMultiplier}x`} />
                </Box>
              </Box>
            }
          >
            <Box
              sx={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.25,
                px: 0.5,
                py: 0.5,
                // Fixed width + no shrink on mobile so the row scrolls.
                flexShrink: 0,
                width: { xs: 62, md: 'auto' },
                scrollSnapAlign: { xs: 'start', md: 'none' },
                transition: 'transform 0.1s',
                cursor: 'help',
                '&:hover': { transform: 'translateY(-2px)' },
              }}
            >
              <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <Box
                  component="img"
                  src={LEVEL_ICONS[tierIndex]}
                  alt={`Level ${m.level}`}
                  sx={{
                    width: { xs: 30, md: 40 }, height: { xs: 30, md: 40 }, objectFit: 'contain',
                    filter: m.unlocked ? `drop-shadow(0 0 6px ${withAlpha(tierColor, 0.5)})` : 'grayscale(1)',
                    opacity: m.unlocked ? 1 : 0.35,
                    transition: 'opacity 0.15s, filter 0.15s',
                  }}
                />
                {!m.unlocked && (
                  <LockOutlined sx={{ position: 'absolute', fontSize: { xs: 14, md: 16 }, color: t.text.secondary }} />
                )}
              </Box>
              <Typography
                sx={{
                  fontSize: { xs: '0.62rem', md: '0.68rem' },
                  fontWeight: 700,
                  color: titleColor,
                  textAlign: 'center',
                  lineHeight: 1.15,
                  // Truncate so longer tier names ("Apex Legend") don't
                  // wrap awkwardly and break the grid row height.
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}
              >
                {m.title}
              </Typography>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
