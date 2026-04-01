'use client';

import { Box } from '@mui/material';
import { useThemeTokens } from '@/app/providers';

export function TypingIndicator() {
  const t = useThemeTokens();
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <Box
        sx={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: t.up,
          opacity: 0.6,
        }}
      />
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              backgroundColor: t.text.dimmed,
              animation: `typingDot 1s ease-in-out ${i * 0.15}s infinite`,
              '@keyframes typingDot': {
                '0%, 100%': { opacity: 0.3 },
                '50%': { opacity: 1 },
              },
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
