import { Card, CardContent, Box, Skeleton } from '@mui/material';

export function PoolDetailSkeleton() {
  return (
    <>
      {/* Pool info card */}
      <Card
        sx={{
          background: '#111820',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* Title + status */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
            <Skeleton variant="text" width={160} height={40} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)' }} />
            <Skeleton variant="rounded" width={72} height={28} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)', borderRadius: 4 }} />
          </Box>

          {/* Live price box */}
          <Box
            sx={{
              mb: 4,
              p: 3,
              borderRadius: 1,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <Skeleton variant="text" width={80} height={16} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)', mb: 1 }} />
            <Skeleton variant="text" width={180} height={44} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)' }} />
          </Box>

          {/* Countdown area */}
          <Box sx={{ mb: 4 }}>
            <Skeleton variant="text" width={120} height={16} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)', mb: 1.5 }} />
            <Box sx={{ display: 'flex', gap: 1 }}>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} variant="rounded" width={56} height={56} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)', borderRadius: 1 }} />
              ))}
            </Box>
          </Box>

          {/* Distribution */}
          <Box sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
              <Skeleton variant="text" width={80} height={20} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)' }} />
              <Skeleton variant="text" width={80} height={20} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)' }} />
            </Box>
            <Skeleton variant="rounded" width="100%" height={6} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)', borderRadius: 1, mb: 3 }} />
            {/* Odds cards */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Skeleton variant="rounded" height={80} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)', borderRadius: 1, flex: 1 }} />
              <Skeleton variant="rounded" height={80} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)', borderRadius: 1, flex: 1 }} />
            </Box>
          </Box>

          {/* Total pool */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              pt: 2,
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <Skeleton variant="text" width={70} height={16} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)' }} />
            <Skeleton variant="text" width={90} height={24} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)' }} />
          </Box>
        </CardContent>
      </Card>
    </>
  );
}

export function BetFormSkeleton() {
  return (
    <Card
      sx={{
        background: '#111820',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <CardContent sx={{ p: 4 }}>
        {/* Title */}
        <Skeleton variant="text" width={140} height={28} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)', mb: 3 }} />

        {/* UP/DOWN toggle */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <Skeleton variant="rounded" height={48} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)', borderRadius: 1, flex: 1 }} />
          <Skeleton variant="rounded" height={48} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)', borderRadius: 1, flex: 1 }} />
        </Box>

        {/* Amount input */}
        <Skeleton variant="rounded" height={48} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)', borderRadius: 1, mb: 2 }} />

        {/* Preset buttons */}
        <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={32} sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)', borderRadius: 1, flex: 1 }} />
          ))}
        </Box>

        {/* Submit button */}
        <Skeleton variant="rounded" height={48} sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)', borderRadius: 1 }} />
      </CardContent>
    </Card>
  );
}
