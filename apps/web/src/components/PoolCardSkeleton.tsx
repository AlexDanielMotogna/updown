import { Card, CardContent, Box, Skeleton } from '@mui/material';

export function PoolCardSkeleton() {
  return (
    <Card
      sx={{
        overflow: 'hidden',
        background: '#111820',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        {/* Header: asset + status chip */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Skeleton variant="text" width={100} height={28} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)' }} />
            <Skeleton variant="text" width={140} height={36} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)', mt: 0.5 }} />
          </Box>
          <Skeleton variant="rounded" width={64} height={24} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)', borderRadius: 4 }} />
        </Box>

        {/* Countdown / Info area */}
        <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Skeleton variant="text" width={50} height={20} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)' }} />
            <Skeleton variant="text" width={80} height={20} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)' }} />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Skeleton variant="text" width={40} height={20} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)' }} />
            <Skeleton variant="text" width={100} height={20} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)' }} />
          </Box>
        </Box>

        {/* Distribution */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
            <Skeleton variant="text" width={80} height={20} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)' }} />
            <Skeleton variant="text" width={80} height={20} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)' }} />
          </Box>
          <Skeleton variant="rounded" width="100%" height={6} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)', borderRadius: 1 }} />
        </Box>

        {/* Total pool */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pt: 2,
            mt: 'auto',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <Skeleton variant="text" width={70} height={16} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)' }} />
          <Skeleton variant="text" width={60} height={20} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)' }} />
        </Box>
      </CardContent>
    </Card>
  );
}
