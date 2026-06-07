import { Box, Skeleton } from '@mui/material';
import { useThemeTokens } from '@/app/providers';

/**
 * Loading placeholder matching the current MarketCard layout (header chip +
 * time, title thumbnail + lines, outcome rows, volume footer). Render N of
 * these inside the same grid the cards use.
 */
export function MarketCardSkeleton({ rows = 3 }: { rows?: number }) {
  const t = useThemeTokens();
  const bar = t.border.subtle;
  return (
    <Box
      sx={{
        bgcolor: t.bg.surface,
        border: t.surfaceBorder,
        borderRadius: 2,
        p: { xs: 1.5, md: 1.75 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        height: '100%',
      }}
    >
      {/* Header: category chip + time */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Skeleton variant="text" width={70} height={12} sx={{ bgcolor: bar }} />
        <Skeleton variant="text" width={38} height={12} sx={{ bgcolor: bar }} />
      </Box>

      {/* Title: thumbnail + 2 lines */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Skeleton variant="rounded" width={36} height={36} sx={{ bgcolor: bar, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Skeleton variant="text" width="92%" height={15} sx={{ bgcolor: t.border.default }} />
          <Skeleton variant="text" width="55%" height={15} sx={{ bgcolor: t.border.default }} />
        </Box>
      </Box>

      {/* Outcome rows */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flex: 1, justifyContent: 'center' }}>
        {Array.from({ length: rows }).map((_, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
            <Skeleton variant="circular" width={24} height={24} sx={{ bgcolor: bar, flexShrink: 0 }} />
            <Skeleton variant="text" width={`${50 + (i % 3) * 12}%`} height={14} sx={{ bgcolor: bar, flex: 1 }} />
            <Skeleton variant="rounded" width={46} height={22} sx={{ bgcolor: bar, borderRadius: '999px', flexShrink: 0 }} />
          </Box>
        ))}
      </Box>

      {/* Footer: volume + bets */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 0.75, borderTop: `1px solid ${t.border.subtle}` }}>
        <Skeleton variant="text" width={64} height={12} sx={{ bgcolor: bar }} />
        <Skeleton variant="text" width={48} height={12} sx={{ bgcolor: bar }} />
      </Box>
    </Box>
  );
}
