import { Box, Skeleton } from '@mui/material';

/**
 * Skeleton for a BetRow in the profile page.
 * Matches the grid layout: box image, asset, result, stake, payout, price, time, action, tx
 */
export function BetCardSkeleton() {
  return (
    <>
      {/* Desktop row skeleton */}
      <Box
        sx={{
          display: { xs: 'none', md: 'grid' },
          gridTemplateColumns: '80px 2.5fr 1fr 1fr 1fr 2fr 1fr 1fr 1.2fr',
          alignItems: 'center',
          px: 0,
          py: 0,
          minHeight: 70,
          bgcolor: '#0D1219',
        }}
      >
        {/* Box image */}
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
          <Skeleton variant="rounded" width={60} height={50} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
        </Box>
        {/* Asset + chips */}
        <Box sx={{ pl: 1.5 }}>
          <Skeleton variant="text" width={90} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
            <Skeleton variant="rounded" width={36} height={16} sx={{ bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '2px' }} />
            <Skeleton variant="rounded" width={52} height={16} sx={{ bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '2px' }} />
          </Box>
        </Box>
        {/* Result */}
        <Skeleton variant="rounded" width={48} height={20} sx={{ bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '2px' }} />
        {/* Stake */}
        <Skeleton variant="text" width={55} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
        {/* Payout */}
        <Skeleton variant="text" width={55} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
        {/* Price */}
        <Skeleton variant="text" width={120} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
        {/* Time */}
        <Skeleton variant="text" width={70} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
        {/* Action */}
        <Skeleton variant="rounded" width={56} height={28} sx={{ bgcolor: 'rgba(255,255,255,0.06)', borderRadius: '2px' }} />
        {/* Tx */}
        <Skeleton variant="text" width={60} height={16} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
      </Box>

      {/* Mobile card skeleton */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, bgcolor: '#0D1219', p: 2 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Skeleton variant="rounded" width={40} height={40} sx={{ bgcolor: 'rgba(255,255,255,0.04)', flexShrink: 0 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width={100} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
              <Skeleton variant="rounded" width={36} height={16} sx={{ bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '2px' }} />
              <Skeleton variant="rounded" width={44} height={16} sx={{ bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '2px' }} />
            </Box>
          </Box>
        </Box>
        {/* Stake/payout */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Skeleton variant="text" width={90} height={16} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
          <Skeleton variant="text" width={80} height={16} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
        </Box>
        {/* Price/time */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Skeleton variant="text" width={120} height={16} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
          <Skeleton variant="text" width={60} height={16} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
        </Box>
        {/* Action */}
        <Box sx={{ pt: 1.5 }}>
          <Skeleton variant="rounded" width="100%" height={44} sx={{ bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '2px' }} />
        </Box>
      </Box>
    </>
  );
}
