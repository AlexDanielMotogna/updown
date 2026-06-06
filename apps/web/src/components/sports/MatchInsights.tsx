'use client';

/**
 * "Stats / Head to Head" toggle that sits below the score row on /match/[id].
 *
 * Wraps two surfaces in a single tabbed shell:
 *   - Stats: OddsChart with the live percentage timeline per outcome.
 *   - H2H:   MatchAnalysis (last 10 meetings + summary).
 *
 * The toggle replaces the old layout that stacked both blocks vertically and
 * pushed the bet card further down the page.
 */

import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { BarChart, History, Groups } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { OddsChart } from '@/components/pool/OddsChart';
import { MatchAnalysis } from '@/components/sports/MatchAnalysis';
import { LineupGrid } from '@/components/sports/MatchLineups';
import { fetchLineup } from '@/lib/api';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface Props {
  poolId: string;
  homeTeam: string;
  awayTeam: string;
  totalUp: string;
  totalDown: string;
  totalDraw: string;
  numSides?: number;
  matchId?: string | null;
  matchAnalysis?: string | null;
  labels?: { up?: string; down?: string; draw?: string };
  /** Crests / icons rendered inside the chart hover tooltip + endpoint
   *  badges. Resolved upstream via lib/oddsChartProps so the chart picks
   *  up team crests on sports pools, the same way /match/[id]'s PM
   *  variant gets Yes/No glyphs or Up/Down PNGs. */
  icons?: { up?: string | null; down?: string | null; draw?: string | null };
}

type Tab = 'stats' | 'h2h' | 'lineups';

export function MatchInsights({
  poolId,
  homeTeam,
  awayTeam,
  totalUp,
  totalDown,
  totalDraw,
  numSides,
  matchId,
  matchAnalysis,
  labels,
  icons,
}: Props) {
  const t = useThemeTokens();
  // Default to Stats - that's the chart Kalshi shows above the fold. H2H is
  // the secondary lens for users who want context on past meetings.
  const [tab, setTab] = useState<Tab>('stats');
  const hasH2H = !!matchAnalysis;
  const { data: lineupData } = useQuery({
    queryKey: ['lineup', matchId],
    queryFn: () => fetchLineup(matchId!),
    enabled: !!matchId,
    staleTime: 5 * 60_000,
  });
  const lineup = lineupData?.data;
  const hasLineup = !!lineup?.hasData;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Tab strip */}
      <Box sx={{ display: 'flex', gap: 0.5, borderBottom: `1px solid ${t.border.subtle}`, px: { xs: 0.5, md: 1 } }}>
        <TabButton
          active={tab === 'stats'}
          onClick={() => setTab('stats')}
          icon={<BarChart sx={{ fontSize: 16 }} />}
          label="Stats"
        />
        {hasH2H && (
          <TabButton
            active={tab === 'h2h'}
            onClick={() => setTab('h2h')}
            icon={<History sx={{ fontSize: 16 }} />}
            label="Head to Head"
          />
        )}
        {hasLineup && (
          <TabButton
            active={tab === 'lineups'}
            onClick={() => setTab('lineups')}
            icon={<Groups sx={{ fontSize: 16 }} />}
            label="Lineups"
          />
        )}
      </Box>

      {/* Tab body */}
      {tab === 'stats' && (
        <OddsChart
          poolId={poolId}
          totalUp={totalUp}
          totalDown={totalDown}
          totalDraw={totalDraw}
          lockSource="updown"
          hideControls
          seedDefault
          threeWay={numSides === 3}
          labels={labels}
          icons={icons}
        />
      )}
      {tab === 'h2h' && hasH2H && (
        <MatchAnalysis
          matchAnalysis={matchAnalysis}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          numSides={numSides}
        />
      )}
      {tab === 'lineups' && lineup && <LineupGrid lineup={lineup} homeName={homeTeam} awayName={awayTeam} />}
    </Box>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  const t = useThemeTokens();
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.6,
        px: 1.5,
        py: 1,
        border: 'none',
        bgcolor: 'transparent',
        fontFamily: 'inherit',
        fontSize: '0.82rem',
        fontWeight: 800,
        color: active ? t.text.primary : t.text.tertiary,
        cursor: 'pointer',
        borderBottom: '2px solid',
        borderColor: active ? t.accent : 'transparent',
        mb: '-1px',
        transition: 'color 0.15s, border-color 0.15s, background 0.15s',
        '&:hover': active ? {} : { color: t.text.primary, bgcolor: withAlpha(t.text.primary, 0.04) },
      }}
    >
      {icon}
      <Typography component="span" sx={{ fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 1 }}>
        {label}
      </Typography>
    </Box>
  );
}
