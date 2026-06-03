'use client';

/**
 * End-of-pool surfaces shared by crypto pools (PlaceBetCard) and sports /
 * PM pages (/match/[id]). Two variants on the same shell:
 *
 *   - DeterminingCard: spinner + "Hold on, determining winner…" — shown
 *     between the moment the market closes and the on-chain resolution
 *     committing the winner.
 *
 *   - OutcomeCard: large filled check tile + "Outcome: {label}" — final
 *     state once `pool.winner` is set.
 *
 *   - CancelledCard: "Market cancelled" + refund explainer. Shown when
 *     pool.status === 'CANCELLED' (Polymarket retired the listing AND
 *     our oracle layer couldn't recover the resolution from CTF, or the
 *     pool stuck > UMA grace window). Any user position is refunded
 *     on-chain — we surface that fact instead of leaving the user
 *     staring at the determining spinner forever.
 *
 * All three wrap the same EndedCard shell so the border / padding /
 * "Terms of Use" footer are identical across surfaces. Generic over the
 * side labels (Up/Down for crypto, Home/Away/Draw or actual team names
 * for sports).
 */

import { Box, CircularProgress, Tooltip, Typography } from '@mui/material';
import { CheckCircle, ReplayCircleFilled } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

// ─── Terms of Use footer (shared) ────────────────────────────────────────────

export function TermsFooter() {
  const t = useThemeTokens();
  return (
    <Tooltip
      title="By trading, you agree to the Terms of Use, including that you are not (i) a U.S. person and (ii) located in the United States, France or other restricted territory."
      arrow
      placement="top"
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: t.bg.tooltip,
            border: `1px solid ${t.border.strong}`,
            fontSize: '0.72rem',
            maxWidth: 280,
            lineHeight: 1.4,
            p: 1.2,
          },
        },
        arrow: { sx: { color: t.bg.tooltip } },
      }}
    >
      <Typography
        sx={{
          fontSize: '0.78rem',
          color: t.text.secondary,
          fontWeight: 600,
          textAlign: 'center',
          mt: 1.5,
          cursor: 'help',
          '&:hover': { color: t.text.primary },
          transition: 'color 0.15s',
        }}
      >
        By trading, you agree to the <Box component="span" sx={{ textDecoration: 'underline' }}>Terms of Use</Box>.
      </Typography>
    </Tooltip>
  );
}

// ─── Shell ───────────────────────────────────────────────────────────────────

interface EndedShellProps {
  /** Bold label under the centered icon ("Bitcoin Up or Down · 5m",
   *  "Bragantino vs Internacional · Brazilian Serie A", …). */
  subtitle: string;
  /** Optional smaller line under subtitle: prediction window for crypto,
   *  kickoff date/time for sports. */
  meta?: string;
  children: React.ReactNode;
}

function EndedShell({ subtitle, meta, children }: EndedShellProps) {
  const t = useThemeTokens();
  return (
    <Box>
      <Box
        sx={{
          bgcolor: t.bg.surfaceAlt,
          border: `1px solid ${t.border.subtle}`,
          borderRadius: 2,
          p: { xs: 2, md: 2.5 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {children}
        <Typography
          suppressHydrationWarning
          sx={{
            fontSize: '0.78rem',
            fontWeight: 600,
            color: t.text.tertiary,
            lineHeight: 1.45,
          }}
        >
          {subtitle}
          {meta && (
            <Box
              component="span"
              sx={{
                display: 'block',
                fontWeight: 500,
                color: t.text.quaternary,
                fontVariantNumeric: 'tabular-nums',
                mt: 0.25,
              }}
            >
              {meta}
            </Box>
          )}
        </Typography>
      </Box>
      <TermsFooter />
    </Box>
  );
}

// ─── Determining ─────────────────────────────────────────────────────────────

interface DeterminingCardProps {
  subtitle: string;
  meta?: string;
  /** Optional override for the long explanation line. Defaults to the
   *  Polymarket-style "Final resolution will appear automatically…" copy. */
  bodyText?: string;
}

export function DeterminingCard({
  subtitle,
  meta,
  bodyText = 'This market has ended. Final resolution will appear automatically as soon as it is available on-chain.',
}: DeterminingCardProps) {
  const t = useThemeTokens();
  return (
    <EndedShell subtitle={subtitle} meta={meta}>
      <CircularProgress size={28} sx={{ color: t.text.secondary, mt: 0.5 }} />
      <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: t.text.primary, lineHeight: 1.3 }}>
        Hold on, determining winner…
      </Typography>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: t.text.tertiary, lineHeight: 1.45, maxWidth: 280 }}>
        {bodyText}
      </Typography>
    </EndedShell>
  );
}

// ─── Outcome ─────────────────────────────────────────────────────────────────

interface OutcomeCardProps {
  subtitle: string;
  meta?: string;
  /** The winning side's human label ("Up", "Down", "Bragantino", "Draw", …). */
  outcomeLabel: string;
  /** Theme-token color used for both the filled check tile and the label. */
  outcomeColor: string;
}

export function OutcomeCard({ subtitle, meta, outcomeLabel, outcomeColor }: OutcomeCardProps) {
  const t = useThemeTokens();
  return (
    <EndedShell subtitle={subtitle} meta={meta}>
      <Box
        sx={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          bgcolor: outcomeColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mt: 0.5,
        }}
      >
        <CheckCircle sx={{ fontSize: 36, color: t.text.contrast }} />
      </Box>
      <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: outcomeColor, lineHeight: 1.3 }}>
        Outcome: {outcomeLabel}
      </Typography>
    </EndedShell>
  );
}

// ─── Cancelled ───────────────────────────────────────────────────────────────

interface CancelledCardProps {
  subtitle: string;
  meta?: string;
  /** When true, the body line acknowledges the user's position and tells
   *  them the refund has landed. When false (or omitted), the generic
   *  no-position copy is shown — useful for the public read-only state.
   *
   *  The match page doesn't yet wire per-user bet status into this
   *  surface, so this prop is opt-in; PlaceBetCard (crypto) does have
   *  the bet context and can flip it on. */
  hasUserPosition?: boolean;
  /** Optional override for the body copy. Defaults to a Polymarket-aware
   *  explanation about market retirement + automatic refund. */
  bodyText?: string;
}

export function CancelledCard({
  subtitle,
  meta,
  hasUserPosition = false,
  bodyText,
}: CancelledCardProps) {
  const t = useThemeTokens();
  // Cancellation copy. We avoid using the word "refund" when there's no
  // position — for a 0-bet pool the surface is informational, not a
  // status update on the viewer's money.
  const body = bodyText
    ?? (hasUserPosition
      ? 'This market could not be resolved on the source feed and has been cancelled. Your position has been refunded automatically to your wallet — no action needed.'
      : 'This market could not be resolved on the source feed and has been cancelled. Any positions that had been opened on it were refunded automatically.');
  return (
    <EndedShell subtitle={subtitle} meta={meta}>
      <Box
        sx={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          bgcolor: t.text.dimmed,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mt: 0.5,
        }}
      >
        <ReplayCircleFilled sx={{ fontSize: 36, color: t.text.contrast }} />
      </Box>
      <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: t.text.primary, lineHeight: 1.3 }}>
        Market cancelled
      </Typography>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: t.text.tertiary, lineHeight: 1.45, maxWidth: 300 }}>
        {body}
      </Typography>
    </EndedShell>
  );
}
