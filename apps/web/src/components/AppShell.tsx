'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import { Header } from './Header';
import { MarketSidebar } from './sidebar/MarketSidebar';
import { MarketsRightRail } from './sidebar/MarketsRightRail';
import { RewardPopup } from './RewardPopup';
import { useThemeTokens } from '@/app/providers';

function Footer() {
  const t = useThemeTokens();

  return (
    <Box
      component="footer"
      sx={{
        display: { xs: 'none', lg: 'block' },
        borderTop: `1px solid ${t.border.subtle}`,
        bgcolor: t.bg.app,
        py: 1.25,
        // Full-bleed background (the outer border + bg span the viewport),
        // inner content centered to the 1400 frame so it lines up with the
        // header and sidebars+content row above.
        width: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1400, mx: 'auto', px: { xs: 2, md: 4 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
          <Box
            component="a"
            href="/status"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, textDecoration: 'none', '&:hover .status-label': { color: t.text.bright }, transition: 'color 0.15s' }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: t.up, flexShrink: 0, boxShadow: `0 0 6px ${t.up}66` }} />
            <Typography className="status-label" sx={{ fontSize: '0.85rem', fontWeight: 600, color: t.text.soft, transition: 'color 0.15s' }}>
              Status
            </Typography>
          </Box>
<Typography
            component="a"
            href="/docs"
            sx={{ fontSize: '0.75rem', color: t.text.quaternary, textDecoration: 'none', '&:hover': { color: t.text.bright }, transition: 'color 0.15s' }}
          >
            Docs
          </Typography>
          <Typography
            component="a"
            href="/faucet"
            sx={{ fontSize: '0.75rem', color: t.text.quaternary, textDecoration: 'none', '&:hover': { color: t.text.bright }, transition: 'color 0.15s' }}
          >
            Faucet
          </Typography>
          <Typography
            component="a"
            href="/privacy"
            sx={{ fontSize: '0.75rem', color: t.text.quaternary, textDecoration: 'none', '&:hover': { color: t.text.bright }, transition: 'color 0.15s' }}
          >
            Privacy & Disclaimer
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
          <Box
            component="a"
            href="https://x.com/Official_UpDown"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: 'flex', color: t.text.dimmed, '&:hover': { color: t.text.bright }, transition: 'color 0.15s' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          </Box>
          <Box
            component="a"
            href="https://discord.gg/updown"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: 'flex', color: t.text.dimmed, '&:hover': { color: t.text.bright }, transition: 'color 0.15s' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" /></svg>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const HEADER_LG = 64;
const TOP_BAR_LG = 56; // approximate height of a typical MarketFilter row (tabs + padding)

export function AppShell({ children, centered = false, topBar }: { children: React.ReactNode; centered?: boolean; topBar?: React.ReactNode }) {
  const t = useThemeTokens();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMarkets = pathname === '/';
  // Detail pages (pool / match) are full-bleed two-column layouts (chart +
  // bet card sidebar). Reserving the 200px MarketSidebar gutter on top of
  // that squeezes the chart and wastes the 1400px frame.
  const isDetailPage = pathname.startsWith('/pool/') || pathname.startsWith('/match/');
  // Trending and detail pages skip the left filter sidebar - both are
  // cross-category / single-market views, no filter rail needed. The landing
  // (`/` with no ?type) IS Trending, so treat a missing type as TRENDING -
  // otherwise the empty sidebar gutter would show and squeeze the content.
  const marketTypeParam = searchParams.get('type') ?? 'TRENDING';
  const hideMarketSidebar =
    (isMarkets && marketTypeParam === 'TRENDING') || isDetailPage
    || pathname === '/live' || pathname === '/leaderboard';
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        pb: { xs: 'calc(72px + env(safe-area-inset-bottom, 0px))', lg: 0 },
      }}
    >
      <Header />
      <RewardPopup />
      {/* Top filter bar (e.g. Markets tabs) - sticky just under the header, full
          width above the sidebar+content row so the sidebars start below it. */}
      {topBar && (
        <Box sx={{
          position: 'sticky', top: { xs: 44, sm: 52, lg: HEADER_LG },
          zIndex: 30, bgcolor: t.bg.app, maxWidth: 1400, mx: 'auto',
          px: { xs: 2, md: 3 }, width: '100%',
        }}>
          {topBar}
        </Box>
      )}
      {/* Sidebars + content row. `flex: 1` so it grows to push the footer
          (which lives OUTSIDE this row) to the bottom of the viewport
          even when content is short. */}
      <Box sx={{ display: 'flex', bgcolor: t.bg.app, maxWidth: 1400, mx: 'auto', width: '100%', flex: 1, minWidth: 0 }}>
        {/* Desktop market sidebar - hidden in `centered` mode (e.g. profile)
            and on the Trending cross-category view (no filters there). */}
        <Box
          sx={{
            display: { xs: 'none', lg: (centered || hideMarketSidebar) ? 'none' : 'block' },
            width: 200,
            flexShrink: 0,
            position: 'sticky',
            top: topBar ? HEADER_LG + TOP_BAR_LG : HEADER_LG,
            height: topBar ? `calc(100vh - ${HEADER_LG + TOP_BAR_LG}px)` : `calc(100vh - ${HEADER_LG}px)`,
          }}
        >
          <MarketSidebar />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {children}
        </Box>
        {/* Right sidebar. On Markets it's the always-on market rail; elsewhere
            it's the user's active pools (closeable). */}
        {/* Right rail in the flex flow only on Markets (the markets rail is part
            of the layout, not an overlay). */}
        <Box
          sx={{
            display: { xs: 'none', lg: isMarkets ? 'block' : 'none' },
            width: 240,
            flexShrink: 0,
            position: 'sticky',
            top: topBar ? HEADER_LG + TOP_BAR_LG : HEADER_LG,
            height: topBar ? `calc(100vh - ${HEADER_LG + TOP_BAR_LG}px)` : `calc(100vh - ${HEADER_LG}px)`,
          }}
        >
          {isMarkets && <MarketsRightRail />}
        </Box>
      </Box>

      {/* Page-level footer: spans the full viewport width, sits below the
          sidebar+content row. Inner content stays aligned with the 1400
          frame the rest of the app uses. */}
      <Footer />

      {/* Predictions sidebar removed - the user found the rail intrusive.
          ActivePoolsSidebar still exists for re-use elsewhere (e.g. inside
          the profile drawer) but no longer overlays the app. */}
    </Box>
  );
}
