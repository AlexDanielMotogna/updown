'use client';

import { Box, Typography } from '@mui/material';
import type { ChatMessage as ChatMessageType } from './speech';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

export function ChatMessage({ msg }: { msg: ChatMessageType }) {
  const t = useThemeTokens();
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
        animation: 'fadeSlideIn 0.3s ease-out',
        '@keyframes fadeSlideIn': {
          from: { opacity: 0, transform: 'translateY(10px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      {msg.sender === 'bot' ? (
        <Box sx={{ display: 'flex', gap: 1, maxWidth: '90%' }}>
          <Box
            sx={{
              width: 6,
              minHeight: 6,
              borderRadius: '50%',
              backgroundColor: t.up,
              mt: 0.8,
              flexShrink: 0,
              opacity: 0.6,
            }}
          />
          <Typography
            sx={{
              fontSize: '0.78rem',
              color: t.text.bright,
              lineHeight: 1.5,
              fontWeight: 300,
            }}
          >
            {msg.text}
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            maxWidth: '80%',
            px: 1.5,
            py: 0.75,
            borderRadius: '2px',
            backgroundColor: withAlpha(t.up, 0.1),
            border: 'none',
          }}
        >
          <Typography
            sx={{
              fontSize: '0.78rem',
              color: t.text.vivid,
              lineHeight: 1.5,
              fontWeight: 400,
            }}
          >
            {msg.text}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
