'use client';

import { Box, Typography } from '@mui/material';
import { useUserProfile } from '@/hooks/useUserProfile';
import { UserLevelBadge } from './UserLevelBadge';
import { XpProgressBar } from './XpProgressBar';
import { UpCoinsBalance } from './UpCoinsBalance';
import { GAIN_COLOR, ACCENT_COLOR, UP_COINS_DIVISOR } from '@/lib/constants';
import { USDC_DIVISOR } from '@/lib/format';

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </Typography>
    </Box>
  );
}

export function UserProfilePanel() {
  const { data: profile, isLoading } = useUserProfile();

  if (isLoading || !profile) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
          {isLoading ? 'Loading profile...' : 'Connect wallet to view profile'}
        </Typography>
      </Box>
    );
  }

  const wageredUsdc = (Number(profile.stats.totalWagered) / USDC_DIVISOR).toFixed(2);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Level + Title */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <UserLevelBadge level={profile.level} title={profile.title} size="md" />
        <Typography
          sx={{
            fontSize: '0.75rem',
            color: 'text.secondary',
          }}
        >
          {profile.walletAddress.slice(0, 4)}...{profile.walletAddress.slice(-4)}
        </Typography>
      </Box>

      {/* XP Progress */}
      <Box sx={{ mb: 3 }}>
        <XpProgressBar
          level={profile.level}
          progress={profile.xpProgress}
          totalXp={profile.totalXp}
          xpToNextLevel={profile.xpToNextLevel}
        />
      </Box>

      {/* UP Coins */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          mb: 3,
          borderRadius: '4px',
          bgcolor: 'rgba(255,255,255,0.03)',
        }}
      >
        <Box>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.5 }}>
            UP Coins Balance
          </Typography>
          <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, color: ACCENT_COLOR }}>
            {(Number(profile.coinsBalance) / UP_COINS_DIVISOR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.5 }}>
            Fee Discount
          </Typography>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: GAIN_COLOR }}>
            {profile.feePercent}%
          </Typography>
        </Box>
      </Box>

      {/* Stats Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 2,
          p: 2,
          borderRadius: '4px',
          bgcolor: 'rgba(255,255,255,0.03)',
        }}
      >
        <StatItem label="Bets" value={profile.stats.totalBets} />
        <StatItem label="Wins" value={profile.stats.totalWins} />
        <StatItem label="Win Rate" value={`${profile.stats.winRate}%`} />
        <StatItem label="Wagered" value={`$${wageredUsdc}`} />
        <StatItem label="Streak" value={profile.stats.currentStreak} />
        <StatItem label="Best Streak" value={profile.stats.bestStreak} />
      </Box>
    </Box>
  );
}
