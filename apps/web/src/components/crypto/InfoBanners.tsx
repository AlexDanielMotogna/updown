'use client';

import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { RocketLaunch, Campaign, EmojiEvents, Bolt } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

const CYAN = '#5FD8EF';

/** Static banner slides (right column). Edit this array to update announcements. */
const BANNERS: { icon: React.ReactNode; title: string; body: string; accent: string }[] = [
  { icon: <EmojiEvents sx={{ fontSize: 22 }} />, title: 'Weekly $100 prize', body: 'Top the weekly PNL leaderboard and win $100. Resets every Monday — start climbing.', accent: '#FFD700' },
  { icon: <RocketLaunch sx={{ fontSize: 22 }} />, title: 'Testnet launch soon', body: 'This is a preview event. Play with test funds while we build towards the Devnet launch.', accent: CYAN },
  { icon: <Bolt sx={{ fontSize: 22 }} />, title: '1,000 to start', body: 'Every account gets 1,000 to trade instantly — no faucet, no deposit. Sign in and predict.', accent: '#A78BFA' },
  { icon: <Campaign sx={{ fontSize: 22 }} />, title: 'BTC · ETH · SOL', body: 'Call the 5-minute move on the three majors. Fast rounds, live charts, real-time PNL.', accent: '#34D399' },
];
const SLIDE_MS = 6000;

export function InfoBanners() {
  const t = useThemeTokens();
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % BANNERS.length), SLIDE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <Box>
      <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 2.5, border: `1px solid ${t.border.subtle}` }}>
        <Box sx={{ display: 'flex', transform: `translateX(-${i * 100}%)`, transition: 'transform 0.5s ease' }}>
          {BANNERS.map((b) => (
            <Box
              key={b.title}
              sx={{
                flex: '0 0 100%', minWidth: 0, p: 2.75, minHeight: 178, display: 'flex', flexDirection: 'column', justifyContent: 'center',
                background: `radial-gradient(120% 140% at 0% 0%, ${b.accent}1f, transparent 55%), ${t.bg.surface}`,
              }}
            >
              <Box sx={{ width: 42, height: 42, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: `${b.accent}1f`, border: `1px solid ${b.accent}55`, color: b.accent, mb: 1.5 }}>
                {b.icon}
              </Box>
              <Typography sx={{ fontWeight: 900, fontSize: '1.1rem', color: t.text.primary, letterSpacing: '-0.01em', mb: 0.6 }}>{b.title}</Typography>
              <Typography sx={{ fontSize: '0.84rem', color: t.text.secondary, lineHeight: 1.55 }}>{b.body}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', mt: 1.25 }}>
        {BANNERS.map((_, idx) => (
          <Box
            key={idx}
            onClick={() => setI(idx)}
            sx={{ width: idx === i ? 18 : 6, height: 6, borderRadius: 3, bgcolor: idx === i ? CYAN : t.border.strong, cursor: 'pointer', transition: 'all 0.3s ease' }}
          />
        ))}
      </Box>
    </Box>
  );
}
