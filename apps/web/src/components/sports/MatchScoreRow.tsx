'use client';

/**
 * Compact score row under the MatchHeader - Kalshi-style:
 *
 *     [LIVE 1ST · 17']                    ← status pill (live state + minute)
 *  [crest] BRA    3 - 1    INT [crest]    ← score row
 *
 * For matches that haven't kicked off it falls back to "Kickoff Sun May 31, 16:00";
 * for resolved pools the status reads "Full Time" and the score sits in muted
 * tone (the OddsChart's resolved line is the bigger visual cue for who won).
 */

import { Box, Typography } from '@mui/material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface Props {
  homeTeam: string;
  awayTeam: string;
  homeCrest?: string | null;
  awayCrest?: string | null;
  /** Score numbers when the match is live OR full-time. Null pre-kickoff. */
  homeScore?: number | null;
  awayScore?: number | null;
  /** Top-line status label shown above the score: "LIVE 1ST · 17'", "Full Time",
   *  "Kickoff Sun May 31, 16:00", "Match ended", etc. */
  statusText: string;
  /** "live" pulses the dot + green text; "ended" mutes the row; "scheduled"
   *  hides the score area and shows only the kickoff prompt. */
  variant: 'live' | 'ended' | 'scheduled' | 'inplay';
}

function abbrev(name: string): string {
  // Strip city qualifiers Kalshi-style and take the first 3 uppercase letters.
  const cleaned = name.replace(/[^A-Za-zÀ-ÿ]/g, '').toUpperCase();
  return cleaned.slice(0, 3) || name.toUpperCase().slice(0, 3);
}

export function MatchScoreRow({
  homeTeam,
  awayTeam,
  homeCrest,
  awayCrest,
  homeScore,
  awayScore,
  statusText,
  variant,
}: Props) {
  const t = useThemeTokens();

  const statusColor = variant === 'live' ? t.gain
    : variant === 'inplay' ? t.accent
    : t.text.secondary;
  const scoreColor = variant === 'ended' ? t.text.secondary : t.text.primary;
  const showScore = variant !== 'scheduled' && homeScore != null && awayScore != null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        py: { xs: 1.5, md: 2.25 },
        px: 2,
      }}
    >
      {/* Status pill - pulsing dot + label */}
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        {(variant === 'live' || variant === 'inplay') && (
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: statusColor,
              animation: 'scoreRowPulse 1.5s infinite',
              '@keyframes scoreRowPulse': {
                '0%,100%': { opacity: 1, transform: 'scale(1)' },
                '50%': { opacity: 0.4, transform: 'scale(0.8)' },
              },
            }}
          />
        )}
        <Typography
          sx={{
            fontSize: { xs: '0.72rem', md: '0.78rem' },
            fontWeight: 800,
            color: statusColor,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          {statusText}
        </Typography>
      </Box>

      {/* Score row */}
      {showScore ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            gap: { xs: 1.5, md: 3 },
            width: '100%',
            maxWidth: 540,
          }}
        >
          <TeamSide name={homeTeam} crest={homeCrest} align="end" muted={variant === 'ended'} />
          <Typography
            sx={{
              fontSize: { xs: '2rem', md: '2.6rem' },
              fontWeight: 800,
              color: scoreColor,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
              letterSpacing: '-0.02em',
            }}
          >
            {homeScore} <Box component="span" sx={{ color: t.text.quaternary, fontWeight: 700, mx: { xs: 0.5, md: 0.75 } }}>−</Box> {awayScore}
          </Typography>
          <TeamSide name={awayTeam} crest={awayCrest} align="start" muted={variant === 'ended'} />
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            gap: { xs: 1.5, md: 3 },
            width: '100%',
            maxWidth: 540,
          }}
        >
          <TeamSide name={homeTeam} crest={homeCrest} align="end" muted={false} />
          <Box
            sx={{
              px: 1.25,
              py: 0.5,
              borderRadius: 1,
              bgcolor: withAlpha(t.text.primary, 0.05),
              color: t.text.tertiary,
              fontSize: '0.8rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            vs
          </Box>
          <TeamSide name={awayTeam} crest={awayCrest} align="start" muted={false} />
        </Box>
      )}
    </Box>
  );
}

function TeamSide({
  name,
  crest,
  align,
  muted,
}: {
  name: string;
  crest?: string | null;
  align: 'start' | 'end';
  muted: boolean;
}) {
  const t = useThemeTokens();
  // Both sides render with a normal `flex-direction: row` (no row-reverse
  // gotchas with justify-content): we just flip the JSX children so the icon
  // always sits closest to the centre. align === 'end' is the home side
  // (column ends at the centre), align === 'start' is the away side
  // (column starts at the centre).
  const text = (
    <Typography
      key="text"
      sx={{
        fontSize: { xs: '0.82rem', md: '0.95rem' },
        fontWeight: 800,
        color: muted ? t.text.secondary : t.text.primary,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {abbrev(name)}
    </Typography>
  );
  const img = crest ? (
    <Box
      key="img"
      component="img"
      src={crest}
      alt={name}
      sx={{
        width: { xs: 30, md: 38 },
        height: { xs: 30, md: 38 },
        objectFit: 'contain',
        flexShrink: 0,
        opacity: muted ? 0.85 : 1,
      }}
    />
  ) : null;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        justifyContent: align === 'end' ? 'flex-end' : 'flex-start',
        minWidth: 0,
      }}
    >
      {align === 'end' ? [text, img] : [img, text]}
    </Box>
  );
}
