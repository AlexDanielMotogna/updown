import { Card, CardContent, Box, Skeleton } from '@mui/material';

export function BetCardSkeleton() {
  return (
    <Card
      sx={{
        overflow: 'hidden',
        background: '#141414',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <CardContent sx={{ p: 3 }}>
        {/* Header: asset + chips */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
          <Skeleton variant="text" width={90} height={26} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)' }} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Skeleton variant="rounded" width={56} height={24} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)', borderRadius: 4 }} />
            <Skeleton variant="rounded" width={44} height={24} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)', borderRadius: 4 }} />
          </Box>
        </Box>

        {/* Detail rows */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[70, 55, 80, 60].map((w, i) => (
            <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Skeleton variant="text" width={50} height={20} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)' }} />
              <Skeleton variant="text" width={w} height={20} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)' }} />
            </Box>
          ))}
        </Box>

        {/* Tx links area */}
        <Box sx={{ display: 'flex', gap: 1, mt: 2.5 }}>
          <Skeleton variant="rounded" width={90} height={30} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)', borderRadius: 1 }} />
        </Box>
      </CardContent>
    </Card>
  );
}
