import { Box, Skeleton } from '@mui/material';
import { useThemeTokens } from '@/app/providers';

/**
 * Skeleton for a PoolRow in the markets table.
 * Matches the grid layout: box image, asset, countdown, distribution, pool size, odds, players, action, arrow
 */
export function PoolCardSkeleton() {
  const t = useThemeTokens();
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
          bgcolor: t.bg.surfaceAlt,
        }}
      >
        {/* Box image */}
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
          <Skeleton variant="rounded" width={60} height={54} sx={{ bgcolor: t.border.subtle }} />
        </Box>
        {/* Asset */}
        <Box sx={{ pl: 1.5 }}>
          <Skeleton variant="text" width={100} height={20} sx={{ bgcolor: t.border.default }} />
          <Skeleton variant="text" width={60} height={14} sx={{ bgcolor: t.border.subtle }} />
        </Box>
        {/* Countdown */}
        <Skeleton variant="text" width={70} height={20} sx={{ bgcolor: t.border.default }} />
        {/* Distribution */}
        <Box>
          <Skeleton variant="rounded" width={120} height={6} sx={{ bgcolor: t.border.default, borderRadius: 1, mb: 0.5 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: 120 }}>
            <Skeleton variant="text" width={40} height={12} sx={{ bgcolor: t.border.subtle }} />
            <Skeleton variant="text" width={40} height={12} sx={{ bgcolor: t.border.subtle }} />
          </Box>
        </Box>
        {/* Pool size */}
        <Skeleton variant="text" width={60} height={20} sx={{ bgcolor: t.border.default }} />
        {/* Odds */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Skeleton variant="text" width={40} height={18} sx={{ bgcolor: t.border.subtle }} />
          <Skeleton variant="text" width={40} height={18} sx={{ bgcolor: t.border.subtle }} />
        </Box>
        {/* Players */}
        <Skeleton variant="text" width={20} height={18} sx={{ bgcolor: t.border.subtle }} />
        {/* Action */}
        <Skeleton variant="rounded" width={100} height={32} sx={{ bgcolor: t.border.default, borderRadius: '2px' }} />
        {/* Arrow */}
        <Box />
      </Box>

      {/* Mobile card skeleton */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, bgcolor: t.bg.surfaceAlt, p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Skeleton variant="rounded" width={44} height={44} sx={{ bgcolor: t.border.subtle, flexShrink: 0 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width={100} height={20} sx={{ bgcolor: t.border.default }} />
            <Skeleton variant="text" width={60} height={14} sx={{ bgcolor: t.border.subtle }} />
          </Box>
          <Skeleton variant="rounded" width={56} height={20} sx={{ bgcolor: t.border.subtle, borderRadius: '2px' }} />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, pt: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Box key={i}>
              <Skeleton variant="text" width={50} height={18} sx={{ bgcolor: t.border.default }} />
              <Skeleton variant="text" width={35} height={12} sx={{ bgcolor: t.border.subtle }} />
            </Box>
          ))}
        </Box>
      </Box>
    </>
  );
}
