'use client';

import { Box, Tooltip, Typography } from '@mui/material';
import { LockOutlined, EmojiEvents } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { UserProfile } from '@/lib/api';

interface LevelMilestonesProps {
  userProfile: UserProfile | null | undefined;
}

/**
 * Lock/unlock strip showing the 9 level milestones the server returns in
 * `userProfile.milestones`. Each card carries the level number, the title
 * earned at that level, the lifetime XP required, plus the perks unlocked
 * (lower fee + higher coin multiplier). Locked tiers render desaturated
 * with a padlock; unlocked tiers light up with the user's tier colour.
 *
 * Server is the source of truth for which tiers are unlocked — see
 * serializeUserProfile in apps/api/src/utils/serializers.ts — so a tuning
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
        display: 'grid',
        // 9 tiers fit nicely on desktop; on small screens we wrap so a
        // phone reader can still see every milestone without horizontal
        // scroll. minmax(80px, 1fr) keeps the cards square-ish.
        gridTemplateColumns: { xs: 'repeat(4, 1fr)', sm: 'repeat(5, 1fr)', md: 'repeat(9, 1fr)' },
        gap: { xs: 1, md: 1.25 },
      }}
    >
      {milestones.map((m) => {
        // Pick a colour from the existing 10-stop level tier palette so
        // the milestones strip lives in the same visual language as the
        // avatar ring + level badge — no new accent colours introduced.
        const tierIndex = Math.min(Math.floor((m.level - 1) / 4), 9);
        const tierColor = t.levelTiers[tierIndex];
        const bg = m.unlocked ? withAlpha(tierColor, 0.12) : t.hover.light;
        const border = m.unlocked ? withAlpha(tierColor, 0.45) : t.border.subtle;
        const iconColor = m.unlocked ? tierColor : t.text.quaternary;
        const titleColor = m.unlocked ? t.text.primary : t.text.tertiary;

        return (
          <Tooltip
            key={m.level}
            arrow
            placement="top"
            title={
              <Box sx={{ p: 0.25 }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>
                  Lv.{m.level} · {m.title}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', mt: 0.25 }}>
                  {m.unlocked ? 'Unlocked' : `${Number(m.xpRequired).toLocaleString()} XP needed`}
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', mt: 0.4, opacity: 0.85 }}>
                  Fee {m.feePercent}% · Coins ×{m.coinMultiplier}
                </Typography>
              </Box>
            }
          >
            <Box
              sx={{
                position: 'relative',
                aspectRatio: '1 / 1',
                borderRadius: 1.5,
                border: `1px solid ${border}`,
                bgcolor: bg,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.25,
                px: 0.5,
                py: 0.75,
                transition: 'transform 0.1s, border-color 0.15s',
                cursor: 'help',
                '&:hover': { transform: 'translateY(-1px)', borderColor: tierColor },
              }}
            >
              <Typography
                sx={{
                  fontSize: { xs: '0.6rem', md: '0.65rem' },
                  fontWeight: 700,
                  color: t.text.tertiary,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                }}
              >
                Lv.{m.level}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                {m.unlocked
                  ? <EmojiEvents sx={{ fontSize: { xs: 22, md: 26 }, color: iconColor }} />
                  : <LockOutlined sx={{ fontSize: { xs: 20, md: 22 }, color: iconColor }} />}
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
