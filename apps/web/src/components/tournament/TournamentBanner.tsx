'use client';

import { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
import { useBadgeLookup } from '@/hooks/useCategories';
import Link from 'next/link';
import { fetchTournaments, type TournamentSummary } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { AnimatePresence, motion } from 'framer-motion';

const SLIDE_INTERVAL = 10_000;

function BannerSlide({ t: tournament, theme }: { t: TournamentSummary; theme: { bg: string; border: string; accent: string } }) {
  const t = useThemeTokens();
  const getBadge = useBadgeLookup();
  const entryFeeUsdc = (Number(tournament.entryFee) / 1_000_000).toFixed(2);
  const totalPot = (Number(tournament.entryFee) * tournament.size / 1_000_000).toFixed(2);
  const filled = tournament.participantCount ?? tournament._count?.participants ?? 0;
  const isRegistering = tournament.status === 'REGISTERING';
  const isSports = tournament.tournamentType === 'SPORTS';
  const leagueName = isSports && tournament.league ? (LEAGUE_LABELS[tournament.league] || tournament.league) : tournament.asset;
  const matchInfo = isSports ? 'real match results' : `${Math.floor(Number(tournament.matchDuration) / 60)}min matches`;
  const imgSrc = isSports && tournament.league
    ? (getBadge(tournament.league) || '')
    : `/tournaments/tournament-${tournament.asset.toLowerCase()}.png`;

  const title = isRegistering ? `$${totalPot} tournament now open` : `$${totalPot} tournament in progress`;
  const scheduledStr = tournament.scheduledAt ? formatDate(tournament.scheduledAt) : null;
  const subtitle = isRegistering
    ? `${tournament.size}-player ${leagueName} bracket with ${matchInfo}. ${filled} registered, ${tournament.size - filled} spots left.${scheduledStr ? ` Starts ${scheduledStr}.` : ''}`
    : `${tournament.size}-player ${leagueName} bracket with ${matchInfo}. Round ${tournament.currentRound} of ${tournament.totalRounds}.`;

  return (
    <Link href={`/tournament/${tournament.id}`} style={{ textDecoration: 'none' }}>
      <Box
        sx={{
          background: theme.bg,
          border: `1px solid ${theme.border}`,
          borderRadius: 2,
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'border-color 0.15s ease',
          '&:hover': { borderColor: theme.accent },
        }}
      >
        {/* Desktop */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1.5, px: 1.5, py: 0.75 }}>
          <Box
            component="img"
            src={imgSrc}
            alt={tournament.asset}
            sx={{ width: 56, height: 56, objectFit: 'contain', flexShrink: 0, ...(isSports && { bgcolor: t.text.vivid, borderRadius: '50%', p: '8px' }) }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: t.text.primary }}>{title}</Typography>
            <Typography sx={{ fontSize: '0.8rem', color: t.text.strong, fontWeight: 500, mt: 0.25 }}>{subtitle}</Typography>
          </Box>
          <Button
            size="small"
            variant="contained"
            endIcon={<ArrowForward sx={{ fontSize: 14 }} />}
            sx={{
              bgcolor: theme.accent, color: t.text.contrast, fontWeight: 700, fontSize: '0.78rem',
              textTransform: 'none', borderRadius: 1.5, px: 2, py: 0.5,
              boxShadow: 'none', whiteSpace: 'nowrap',
              '&:hover': { bgcolor: theme.accent, filter: 'brightness(0.85)', boxShadow: 'none' },
            }}
          >
            {isRegistering ? 'Join Now' : 'View Bracket'}
          </Button>
        </Box>

        {/* Mobile */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1, px: 1, py: 0.75 }}>
          <Box
            component="img"
            src={imgSrc}
            alt={tournament.asset}
            sx={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0, ...(isSports && { bgcolor: t.text.vivid, borderRadius: '50%', p: '6px', width: 40, height: 40 }) }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: t.text.primary, lineHeight: 1.3 }}>{title}</Typography>
            <Typography sx={{ fontSize: '0.68rem', color: t.text.strong, fontWeight: 500, mt: 0.5, lineHeight: 1.4 }}>{subtitle}</Typography>
          </Box>
        </Box>
      </Box>
    </Link>
  );
}

const LEAGUE_LABELS: Record<string, string> = {
  CL: 'Champions League', PL: 'Premier League', PD: 'La Liga',
  SA: 'Serie A', BL1: 'Bundesliga', FL1: 'Ligue 1',
};

export function TournamentBanner() {
  const t = useThemeTokens();
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const BANNER_THEMES = [
    { bg: `linear-gradient(135deg, ${withAlpha(t.up, 0.08)}, ${withAlpha(t.up, 0.02)})`, border: withAlpha(t.up, 0.15), accent: t.up },
    { bg: `linear-gradient(135deg, ${withAlpha(t.accent, 0.08)}, ${withAlpha(t.accent, 0.02)})`, border: withAlpha(t.accent, 0.15), accent: t.accent },
    { bg: `linear-gradient(135deg, ${withAlpha(t.draw, 0.08)}, ${withAlpha(t.draw, 0.02)})`, border: withAlpha(t.draw, 0.2), accent: t.draw },
    { bg: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(168,85,247,0.02))', border: 'rgba(168,85,247,0.2)', accent: '#A855F7' },
    { bg: 'linear-gradient(135deg, rgba(244,63,94,0.08), rgba(244,63,94,0.02))', border: 'rgba(244,63,94,0.2)', accent: '#F43F5E' },
  ];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchTournaments();
        if (!cancelled && res.success && res.data) {
          const active = res.data.filter(t => t.status === 'REGISTERING' || t.status === 'ACTIVE');
          setTournaments(active);
        }
      } catch { /* ignore */ }
    }
    load();
    const iv = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  // Auto-slide
  useEffect(() => {
    if (tournaments.length <= 1) return;
    const iv = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % tournaments.length);
    }, SLIDE_INTERVAL);
    return () => clearInterval(iv);
  }, [tournaments.length]);

  if (tournaments.length === 0) return null;

  const safeIndex = activeIndex % tournaments.length;
  const current = tournaments[safeIndex];
  const theme = BANNER_THEMES[safeIndex % BANNER_THEMES.length];

  return (
    <Box sx={{ mb: 2, position: 'relative', overflow: 'hidden', height: { xs: 100, md: 100 } }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
        >
          <BannerSlide t={current} theme={theme} />
        </motion.div>
      </AnimatePresence>

      {/* Dots */}
      {tournaments.length > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.75, mt: 1 }}>
          {tournaments.map((_, i) => (
            <Box
              key={i}
              onClick={() => setActiveIndex(i)}
              sx={{
                width: i === safeIndex ? 16 : 6,
                height: 6,
                borderRadius: 3,
                bgcolor: i === safeIndex ? BANNER_THEMES[i % BANNER_THEMES.length].accent : t.hover.emphasis,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
