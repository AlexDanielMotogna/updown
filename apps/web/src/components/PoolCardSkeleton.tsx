import { Box, Skeleton } from '@mui/material';

/**
 * Skeleton for a PoolRow in the markets table.
 * Matches the grid layout: box image, asset, countdown, distribution, pool size, odds, players, action, arrow
 */
export function PoolCardSkeleton() {
  return (
    <>
      {/* Desktop row skeleton */}
      <Box
        sx={{
          display: { xs: 'none', md: 'grid' },
          gridTemplateColumns: '110px minmax(180px, 2fr) 110px 140px 100px 110px 60px 130px 40px',
          alignItems: 'center',
          pr: 2,
          pl: 0,
          py: 0,
          minHeight: 70,
          bgcolor: '#0D1219',
        }}
      >
        {/* Box image */}
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
          <Skeleton variant="rounded" width={60} height={54} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
        </Box>
        {/* Asset */}
        <Box sx={{ pl: 1.5 }}>
          <Skeleton variant="text" width={100} height={20} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
          <Skeleton variant="text" width={60} height={14} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
        </Box>
        {/* Countdown */}
        <Skeleton variant="text" width={70} height={20} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
        {/* Distribution */}
        <Box>
          <Skeleton variant="rounded" width={120} height={6} sx={{ bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 1, mb: 0.5 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: 120 }}>
            <Skeleton variant="text" width={40} height={12} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
            <Skeleton variant="text" width={40} height={12} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
          </Box>
        </Box>
        {/* Pool size */}
        <Skeleton variant="text" width={60} height={20} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
        {/* Odds */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Skeleton variant="text" width={40} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
          <Skeleton variant="text" width={40} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
        </Box>
        {/* Players */}
        <Skeleton variant="text" width={20} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
        {/* Action */}
        <Skeleton variant="rounded" width={100} height={32} sx={{ bgcolor: 'rgba(255,255,255,0.06)', borderRadius: '2px' }} />
        {/* Arrow */}
        <Box />
      </Box>

      {/* Mobile card skeleton */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, bgcolor: '#0D1219', p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Skeleton variant="rounded" width={44} height={44} sx={{ bgcolor: 'rgba(255,255,255,0.04)', flexShrink: 0 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width={100} height={20} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
            <Skeleton variant="text" width={60} height={14} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
          </Box>
          <Skeleton variant="rounded" width={56} height={20} sx={{ bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '2px' }} />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, pt: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Box key={i}>
              <Skeleton variant="text" width={50} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
              <Skeleton variant="text" width={35} height={12} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
            </Box>
          ))}
        </Box>
      </Box>
    </>
  );
}
