'use client';

import { useState, type ReactNode } from 'react';
import { Box } from '@mui/material';
import { darkTokens as t } from '@/lib/theme';

export interface SubTab {
  id: string;
  label: string;
  render: () => ReactNode;
}

/**
 * Lightweight in-section tab bar. Used to fold related tools that used to be
 * separate top-level tabs into a single sidebar section (e.g. Finance =
 * Overview + Payouts, Needs Attention = zombie + PM + knockout queues).
 */
export function SubTabs({ tabs }: { tabs: SubTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find(x => x.id === active) ?? tabs[0];

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2.5, borderBottom: `1px solid ${t.border.medium}`, flexWrap: 'wrap' }}>
        {tabs.map(tb => {
          const on = tb.id === current?.id;
          return (
            <Box
              key={tb.id}
              component="button"
              onClick={() => setActive(tb.id)}
              sx={{
                border: 'none', cursor: 'pointer', bgcolor: 'transparent', fontFamily: 'inherit',
                px: 1.5, py: 1, fontSize: '0.85rem', fontWeight: on ? 600 : 400,
                color: on ? t.text.primary : t.text.secondary,
                borderBottom: `2px solid ${on ? t.accent : 'transparent'}`, mb: '-1px',
                transition: 'color 0.12s',
                '&:hover': { color: t.text.primary },
              }}
            >
              {tb.label}
            </Box>
          );
        })}
      </Box>
      <Box>{current?.render()}</Box>
    </Box>
  );
}
