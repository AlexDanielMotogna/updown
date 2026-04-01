import { Box, Skeleton } from '@mui/material';
import { useThemeTokens } from '@/app/providers';

/**
 * Skeleton for a BetRow in the profile page.
 * Matches the grid layout: box image, asset, result, stake, payout, price, time, action, tx
 */
export function BetCardSkeleton() {
  const t = useThemeTokens();
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
          bgcolor: t.bg.surfaceAlt,
        }}
      >
        {/* Box image */}
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
          <Skeleton variant="rounded" width={60} height={50} sx={{ bgcolor: t.border.subtle }} />
        </Box>
        {/* Asset + chips */}
        <Box sx={{ pl: 1.5 }}>
          <Skeleton variant="text" width={90} height={18} sx={{ bgcolor: t.border.default }} />
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
            <Skeleton variant="rounded" width={36} height={16} sx={{ bgcolor: t.border.subtle, borderRadius: '2px' }} />
            <Skeleton variant="rounded" width={52} height={16} sx={{ bgcolor: t.border.subtle, borderRadius: '2px' }} />
          </Box>
        </Box>
        {/* Result */}
        <Skeleton variant="rounded" width={48} height={20} sx={{ bgcolor: t.border.subtle, borderRadius: '2px' }} />
        {/* Stake */}
        <Skeleton variant="text" width={55} height={18} sx={{ bgcolor: t.border.default }} />
        {/* Payout */}
        <Skeleton variant="text" width={55} height={18} sx={{ bgcolor: t.border.subtle }} />
        {/* Price */}
        <Skeleton variant="text" width={120} height={18} sx={{ bgcolor: t.border.subtle }} />
        {/* Time */}
        <Skeleton variant="text" width={70} height={18} sx={{ bgcolor: t.border.subtle }} />
        {/* Action */}
        <Skeleton variant="rounded" width={56} height={28} sx={{ bgcolor: t.border.default, borderRadius: '2px' }} />
        {/* Tx */}
        <Skeleton variant="text" width={60} height={16} sx={{ bgcolor: t.border.subtle }} />
      </Box>

      {/* Mobile card skeleton */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, bgcolor: t.bg.surfaceAlt, p: 2 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Skeleton variant="rounded" width={40} height={40} sx={{ bgcolor: t.border.subtle, flexShrink: 0 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width={100} height={18} sx={{ bgcolor: t.border.default }} />
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
              <Skeleton variant="rounded" width={36} height={16} sx={{ bgcolor: t.border.subtle, borderRadius: '2px' }} />
              <Skeleton variant="rounded" width={44} height={16} sx={{ bgcolor: t.border.subtle, borderRadius: '2px' }} />
            </Box>
          </Box>
        </Box>
        {/* Stake/payout */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Skeleton variant="text" width={90} height={16} sx={{ bgcolor: t.border.subtle }} />
          <Skeleton variant="text" width={80} height={16} sx={{ bgcolor: t.border.default }} />
        </Box>
        {/* Price/time */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Skeleton variant="text" width={120} height={16} sx={{ bgcolor: t.border.subtle }} />
          <Skeleton variant="text" width={60} height={16} sx={{ bgcolor: t.border.subtle }} />
        </Box>
        {/* Action */}
        <Box sx={{ pt: 1.5 }}>
          <Skeleton variant="rounded" width="100%" height={44} sx={{ bgcolor: t.border.subtle, borderRadius: '2px' }} />
        </Box>
      </Box>
    </>
  );
}
