import { Box, Skeleton } from '@mui/material';
import { useThemeTokens } from '@/app/providers';

/**
 * Skeleton for the pool detail page.
 * Matches: PoolStatsStrip + PoolInfoCards + ArenaSection layout.
 */
export function PoolDetailSkeleton() {
  const t = useThemeTokens();
  return (
    <>
      {/* Stats strip skeleton */}
      <Box sx={{ bgcolor: t.bg.app, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1, md: 1.25 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Skeleton variant="text" width={40} height={16} sx={{ bgcolor: t.border.default }} />
                <Skeleton variant="text" width={55} height={12} sx={{ bgcolor: t.border.subtle }} />
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Info cards skeleton */}
      <Box sx={{ bgcolor: t.bg.surfaceAlt }}>
        <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1.5, md: 2 } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' },
              gap: 0.5,
            }}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <Box key={i} sx={{ bgcolor: t.hover.light, borderRadius: 1, px: { xs: 1.5, md: 2.5 }, py: 1.5 }}>
                <Skeleton variant="text" width={60} height={14} sx={{ bgcolor: t.border.subtle, mb: 0.5 }} />
                <Skeleton variant="text" width={80} height={24} sx={{ bgcolor: t.border.default }} />
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Arena section skeleton */}
      <Box sx={{ px: 2, pt: 2, pb: 4 }}>
        {/* UP/DOWN toggle */}
        <Box sx={{ display: 'flex', gap: 0, mb: 1.5 }}>
          <Skeleton variant="rounded" height={44} sx={{ bgcolor: t.border.subtle, borderRadius: '10px 0 0 10px', flex: 1 }} />
          <Skeleton variant="rounded" height={44} sx={{ bgcolor: t.border.subtle, borderRadius: '0 10px 10px 0', flex: 1 }} />
        </Box>
        {/* Bet form */}
        <BetFormSkeleton />
        {/* Energy bar */}
        <Box sx={{ px: { xs: 1.5, md: 3 }, mt: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Skeleton variant="text" width={70} height={16} sx={{ bgcolor: t.border.subtle }} />
            <Skeleton variant="text" width={60} height={16} sx={{ bgcolor: t.border.subtle }} />
            <Skeleton variant="text" width={70} height={16} sx={{ bgcolor: t.border.subtle }} />
          </Box>
          <Skeleton variant="rounded" width="100%" height={10} sx={{ bgcolor: t.border.default, borderRadius: 5 }} />
        </Box>
      </Box>
    </>
  );
}

export function BetFormSkeleton() {
  const t = useThemeTokens();
  return (
    <Box>
      {/* Amount input */}
      <Skeleton variant="rounded" height={48} sx={{ bgcolor: t.border.subtle, borderRadius: 1, mb: 1.5 }} />
      {/* Preset buttons */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={32} sx={{ bgcolor: t.border.subtle, borderRadius: '2px', flex: 1 }} />
        ))}
      </Box>
      {/* Payout preview rows */}
      {[1, 2, 3].map((i) => (
        <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
          <Skeleton variant="text" width={60} height={14} sx={{ bgcolor: t.border.subtle }} />
          <Skeleton variant="text" width={50} height={14} sx={{ bgcolor: t.border.default }} />
        </Box>
      ))}
      {/* Submit button */}
      <Skeleton variant="rounded" height={44} sx={{ bgcolor: t.border.default, borderRadius: '2px', mt: 1.5 }} />
    </Box>
  );
}
