'use client';

import { useMemo } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { Bet } from '@/lib/api';

interface Props {
  bets: Bet[];
}

const WEEKS = 18; // ~4 months
const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * GitHub-style contribution heatmap of predictions per day — makes the profile
 * feel alive and rewards consistency. Built from the loaded bets' createdAt;
 * intensity scales with how many predictions landed that day.
 */
export function ActivityHeatmap({ bets }: Props) {
  const t = useThemeTokens();

  const { columns, total, maxCount } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of bets) {
      const d = new Date(b.createdAt);
      d.setHours(0, 0, 0, 0);
      const k = dayKey(d);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDow = today.getDay(); // 0=Sun … 6=Sat
    // Start of the last column's week (Sunday), then back WEEKS-1 weeks.
    const lastColStart = new Date(today.getTime() - todayDow * DAY_MS);
    const gridStart = new Date(lastColStart.getTime() - (WEEKS - 1) * 7 * DAY_MS);

    let total = 0;
    let maxCount = 0;
    const columns: Array<Array<{ date: Date; count: number; future: boolean }>> = [];
    for (let w = 0; w < WEEKS; w++) {
      const col: Array<{ date: Date; count: number; future: boolean }> = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(gridStart.getTime() + (w * 7 + d) * DAY_MS);
        const future = date.getTime() > today.getTime();
        const count = future ? 0 : (counts.get(dayKey(date)) ?? 0);
        if (!future) { total += count; if (count > maxCount) maxCount = count; }
        col.push({ date, count, future });
      }
      columns.push(col);
    }
    return { columns, total, maxCount };
  }, [bets]);

  // 4-step intensity scale relative to the busiest day (min 4 so a single bet
  // doesn't paint the brightest shade).
  const shade = (count: number): string => {
    if (count <= 0) return t.hover.medium;
    const denom = Math.max(4, maxCount);
    const level = Math.min(4, Math.ceil((count / denom) * 4));
    const alpha = [0, 0.28, 0.5, 0.72, 1][level];
    return withAlpha(t.gain, alpha);
  };

  const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1.25 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary }}>Activity</Typography>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: t.text.tertiary }}>
          {total} prediction{total === 1 ? '' : 's'} · last {WEEKS} weeks
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: '3px', overflowX: 'auto', pb: 0.5 }}>
        {columns.map((col, ci) => (
          <Box key={ci} sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {col.map((cell, ri) => (
              cell.future ? (
                <Box key={ri} sx={{ width: 12, height: 12 }} />
              ) : (
                <Tooltip key={ri} arrow title={`${cell.count} prediction${cell.count === 1 ? '' : 's'} · ${fmtDate(cell.date)}`}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: shade(cell.count) }} />
                </Tooltip>
              )
            ))}
          </Box>
        ))}
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, justifyContent: 'flex-end' }}>
        <Typography sx={{ fontSize: '0.62rem', color: t.text.quaternary }}>Less</Typography>
        {[0, 1, 2, 3, 4].map(l => (
          <Box key={l} sx={{ width: 11, height: 11, borderRadius: '3px', bgcolor: l === 0 ? t.hover.medium : withAlpha(t.gain, [0, 0.28, 0.5, 0.72, 1][l]) }} />
        ))}
        <Typography sx={{ fontSize: '0.62rem', color: t.text.quaternary }}>More</Typography>
      </Box>
    </Box>
  );
}
