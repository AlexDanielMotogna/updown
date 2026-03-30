'use client';

import { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
import { useBadgeLookup } from '@/hooks/useCategories';
import Link from 'next/link';
import { fetchTournaments, type TournamentSummary } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { UP_COLOR, ACCENT_COLOR } from '@/lib/constants';
import { AnimatePresence, motion } from 'framer-motion';

const SLIDE_INTERVAL = 10_000;

const BANNER_THEMES = [
  { bg: `linear-gradient(135deg, ${UP_COLOR}14, ${UP_COLOR}04)`, border: `${UP_COLOR}25`, accent: UP_COLOR },
  { bg: `linear-gradient(135deg, ${ACCENT_COLOR}14, ${ACCENT_COLOR}04)`, border: `${ACCENT_COLOR}25`, accent: ACCENT_COLOR },
  { bg: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(251,191,36,0.02))', border: 'rgba(251,191,36,0.2)', accent: '#FBBF24' },
  { bg: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(168,85,247,0.02))', border: 'rgba(168,85,247,0.2)', accent: '#A855F7' },
  { bg: 'linear-gradient(135deg, rgba(244,63,94,0.08), rgba(244,63,94,0.02))', border: 'rgba(244,63,94,0.2)', accent: '#F43F5E' },
];

const LEAGUE_LABELS: Record<string, string> = {
  CL: 'Champions League', PL: 'Premier League', PD: 'La Liga',
  SA: 'Serie A', BL1: 'Bundesliga', FL1: 'Ligue 1',
};

function BannerSlide({ t, theme }: { t: TournamentSummary; theme: typeof BANNER_THEMES[0] }) {
  const getBadge = useBadgeLookup();
  const entryFeeUsdc = (Number(t.entryFee) / 1_000_000).toFixed(2);
  const totalPot = (Number(t.entryFee) * t.size / 1_000_000).toFixed(2);
  const filled = t.participantCount ?? t._count?.participants ?? 0;
  const isRegistering = t.status === 'REGISTERING';
  const isSports = t.tournamentType === 'SPORTS';
  const leagueName = isSports && t.league ? (LEAGUE_LABELS[t.league] || t.league) : t.asset;
  const matchInfo = isSports ? 'real match results' : `${Math.floor(Number(t.matchDuration) / 60)}min matches`;
  const imgSrc = isSports && t.league
    ? (getBadge(t.league) || '')
    : `/tournaments/tournament-${t.asset.toLowerCase()}.png`;

  const title = isRegistering ? `$${totalPot} tournament now open` : `$${totalPot} tournament in progress`;
  const scheduledStr = t.scheduledAt ? formatDate(t.scheduledAt) : null;
  const subtitle = isRegistering
    ? `${t.size}-player ${leagueName} bracket with ${matchInfo}. ${filled} registered, ${t.size - filled} spots left.${scheduledStr ? ` Starts ${scheduledStr}.` : ''}`
    : `${t.size}-player ${leagueName} bracket with ${matchInfo}. Round ${t.currentRound} of ${t.totalRounds}.`;

  return (
    <Link href={`/tournament/${t.id}`} style={{ textDecoration: 'none' }}>
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
            alt={t.asset}
            sx={{ width: 56, height: 56, objectFit: 'contain', flexShrink: 0, ...(isSports && { bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '8px' }) }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>{title}</Typography>
            <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', fontWeight: 500, mt: 0.25 }}>{subtitle}</Typography>
          </Box>
          <Button
            size="small"
            variant="contained"
            endIcon={<ArrowForward sx={{ fontSize: 14 }} />}
            sx={{
              bgcolor: theme.accent, color: '#000', fontWeight: 700, fontSize: '0.78rem',
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
            alt={t.asset}
            sx={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0, ...(isSports && { bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '6px', width: 40, height: 40 }) }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: '#fff', lineHeight: 1.3 }}>{title}</Typography>
            <Typography sx={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)', fontWeight: 500, mt: 0.5, lineHeight: 1.4 }}>{subtitle}</Typography>
          </Box>
        </Box>
      </Box>
    </Link>
  );
}

export function TournamentBanner() {
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

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
                bgcolor: i === safeIndex ? BANNER_THEMES[i % BANNER_THEMES.length].accent : 'rgba(255,255,255,0.1)',
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
