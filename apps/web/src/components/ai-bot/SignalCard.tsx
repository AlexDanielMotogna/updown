import { Box, Typography } from '@mui/material';
import type { AnalysisResult, Signal } from '@/lib/technical-analysis';
import { UP_COLOR, DOWN_COLOR } from '@/lib/constants';

const colorForSignal = (s: Signal) => (s === 'UP' ? UP_COLOR : DOWN_COLOR);

export function SignalCard({ analysis }: { analysis: AnalysisResult }) {
  const color = colorForSignal(analysis.signal);

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 0,
        background: analysis.signal === 'UP' ? 'rgba(0, 229, 255, 0.06)' : 'rgba(255, 82, 82, 0.06)',
        border: 'none',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color }}>
          {analysis.signal === 'UP' ? '\u25B2' : '\u25BC'} {analysis.signal}
        </Typography>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color }}>
          {analysis.confidence}%
        </Typography>
      </Box>
      <Box sx={{ height: 4, borderRadius: 0, backgroundColor: 'rgba(255, 255, 255, 0.08)', mb: 1.5, overflow: 'hidden' }}>
        <Box
          sx={{
            height: '100%',
            width: `${analysis.confidence}%`,
            borderRadius: 0,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            transition: 'width 0.5s ease',
          }}
        />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {analysis.indicators.map((ind) => {
          const indColor = colorForSignal(ind.signal);
          return (
            <Box
              key={ind.name}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.25,
                borderRadius: '2px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: 'none',
              }}
            >
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.03em' }}>
                {ind.name}
              </Typography>
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: indColor }}>
                {ind.signal}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
