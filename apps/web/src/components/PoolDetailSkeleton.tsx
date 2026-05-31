import { Box, Skeleton } from '@mui/material';
import { useThemeTokens } from '@/app/providers';

/**
 * Skeleton for the pool detail page. Mirrors the new 2-column Polymarket-style
 * layout: identity header + price strip + chart on the left, Place Bet + side
 * lists on the right.
 */
export function PoolDetailSkeleton() {
  const t = useThemeTokens();
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 340px' },
        gap: { xs: 2, md: 2 },
        maxWidth: 1400,
        mx: 'auto',
        px: { xs: 0, md: 1 },
      }}
    >
      {/* Main column */}
      <Box>
        {/* Header - colored tile + title/window + share icons */}
        <Box sx={{ px: { xs: 2, md: 3 }, py: { xs: 1.5, md: 2 }, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Skeleton variant="rounded" width={56} height={56} sx={{ bgcolor: t.border.default, borderRadius: 1.5 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Skeleton variant="text" width="60%" height={28} sx={{ bgcolor: t.border.default }} />
            <Skeleton variant="text" width="40%" height={16} sx={{ bgcolor: t.border.subtle, mt: 0.25 }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {[1, 2, 3].map(i => <Skeleton key={i} variant="rounded" width={28} height={28} sx={{ bgcolor: t.border.subtle, borderRadius: 1 }} />)}
          </Box>
        </Box>
        {/* Price strip - strike / current / countdown */}
        <Box sx={{ px: { xs: 2, md: 3 }, pb: 1.25, display: 'flex', gap: 4, alignItems: 'flex-end' }}>
          {[1, 2].map(i => (
            <Box key={i}>
              <Skeleton variant="text" width={80} height={12} sx={{ bgcolor: t.border.subtle, mb: 0.5 }} />
              <Skeleton variant="text" width={110} height={22} sx={{ bgcolor: t.border.default }} />
            </Box>
          ))}
          <Skeleton variant="text" width={140} height={22} sx={{ bgcolor: t.border.default, ml: 'auto' }} />
        </Box>
        {/* Chart */}
        <Box sx={{ px: { xs: 0, md: 1 } }}>
          <Skeleton variant="rounded" height={460} sx={{ bgcolor: t.bg.app, borderRadius: 2 }} />
        </Box>
      </Box>

      {/* Right sidebar */}
      <Box sx={{ px: { xs: 1.5, md: 0 } }}>
        {/* Place Bet card */}
        <Box sx={{ bgcolor: t.hover.subtle, borderRadius: '10px', p: 2 }}>
          <Box sx={{ display: 'flex', gap: 0, mb: 1.5 }}>
            <Skeleton variant="rounded" height={44} sx={{ bgcolor: t.border.subtle, flex: 1, mr: 0.5 }} />
            <Skeleton variant="rounded" height={44} sx={{ bgcolor: t.border.subtle, flex: 1 }} />
          </Box>
          <BetFormSkeleton />
        </Box>
        {/* Activity list */}
        <Box sx={{ mt: 2 }}>
          <Skeleton variant="text" width={80} height={12} sx={{ bgcolor: t.border.subtle, mb: 1 }} />
          {[1, 2, 3, 4].map(i => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.6, px: 0.5 }}>
              <Skeleton variant="text" width={60} height={14} sx={{ bgcolor: t.border.subtle }} />
              <Skeleton variant="text" width={30} height={14} sx={{ bgcolor: t.border.subtle }} />
              <Skeleton variant="text" width={40} height={14} sx={{ bgcolor: t.border.default, ml: 'auto' }} />
            </Box>
          ))}
        </Box>
        {/* More markets */}
        <Box sx={{ mt: 2 }}>
          <Skeleton variant="text" width={120} height={12} sx={{ bgcolor: t.border.subtle, mb: 1 }} />
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} variant="rounded" height={44} sx={{ bgcolor: t.hover.light, borderRadius: 1, mb: 0.5 }} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export function BetFormSkeleton() {
  const t = useThemeTokens();
  return (
    <Box>
      <Skeleton variant="rounded" height={48} sx={{ bgcolor: t.border.subtle, borderRadius: 1, mb: 1.5 }} />
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={32} sx={{ bgcolor: t.border.subtle, borderRadius: '2px', flex: 1 }} />
        ))}
      </Box>
      {[1, 2, 3].map((i) => (
        <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
          <Skeleton variant="text" width={60} height={14} sx={{ bgcolor: t.border.subtle }} />
          <Skeleton variant="text" width={50} height={14} sx={{ bgcolor: t.border.default }} />
        </Box>
      ))}
      <Skeleton variant="rounded" height={44} sx={{ bgcolor: t.border.default, borderRadius: '2px', mt: 1.5 }} />
    </Box>
  );
}
