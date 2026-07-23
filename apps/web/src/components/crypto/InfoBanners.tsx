'use client';

import { Box, Typography } from '@mui/material';
import { RocketLaunch, Campaign, EmojiEvents } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

const CYAN = '#5FD8EF';

/** Static info banners (right column). Edit this array to update announcements. */
const BANNERS: { icon: React.ReactNode; title: string; body: string; accent?: string }[] = [
  { icon: <RocketLaunch sx={{ fontSize: 18 }} />, title: 'Testnet launch soon', body: 'This event is a preview. Play with test funds while we build towards the Devnet launch.' },
  { icon: <EmojiEvents sx={{ fontSize: 18 }} />, title: 'Weekly $100 prize', body: 'Top the weekly PNL leaderboard and win $100. Resets every Monday.', accent: '#FFD700' },
  { icon: <Campaign sx={{ fontSize: 18 }} />, title: 'New: crypto predictions', body: 'Call BTC, ETH and SOL 5-minute moves. Every account starts with 1,000 to trade.' },
];

export function InfoBanners() {
  const t = useThemeTokens();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {BANNERS.map((b) => {
        const accent = b.accent ?? CYAN;
        return (
          <Box key={b.title} sx={{ borderRadius: 2, border: `1px solid ${t.border.subtle}`, borderLeft: `3px solid ${accent}`, bgcolor: t.bg.surface, p: 1.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, color: accent }}>
              {b.icon}
              <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: t.text.primary }}>{b.title}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.76rem', color: t.text.secondary, lineHeight: 1.5 }}>{b.body}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}
