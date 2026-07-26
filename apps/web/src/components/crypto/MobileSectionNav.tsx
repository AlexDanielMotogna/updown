'use client';

import { Box, Typography } from '@mui/material';
import { ShowChart, Bolt, EmojiEvents, InfoOutlined } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

const CYAN = '#5FD8EF';

const ITEMS = [
  { id: 'sec-predict', label: 'Predict', Icon: ShowChart },
  { id: 'sec-activity', label: 'Activity', Icon: Bolt },
  { id: 'sec-leaderboard', label: 'Ranking', Icon: EmojiEvents },
  { id: 'sec-info', label: 'Info', Icon: InfoOutlined },
];

/** Fixed bottom nav (mobile only) — taps scroll to each section of the event. */
export function MobileSectionNav() {
  const t = useThemeTokens();

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Box sx={{ display: { xs: 'flex', lg: 'none' }, position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 95, bgcolor: t.bg.surface, borderTop: `1px solid ${t.border.subtle}`, height: 56, boxShadow: '0 -6px 20px rgba(0,0,0,0.35)' }}>
      {ITEMS.map(({ id, label, Icon }) => (
        <Box
          key={id}
          onClick={() => go(id)}
          sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.25, cursor: 'pointer', color: t.text.secondary, '&:active': { color: CYAN } }}
        >
          <Icon sx={{ fontSize: 20 }} />
          <Typography sx={{ fontSize: '0.6rem', fontWeight: 700 }}>{label}</Typography>
        </Box>
      ))}
    </Box>
  );
}
