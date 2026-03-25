'use client';

import { useState, useEffect } from 'react';
import { Box, Container, Typography, Tooltip, Drawer, IconButton } from '@mui/material';
import {
  EmojiEvents,
  Bolt,
  HourglassTop,
  CheckCircle,
  Star,
  Notifications,
  SmartToy,
  ShowChart,
  WorkOutline,
  AccountBalanceWallet,
  Lock,
  Gavel,
  Verified,
  SwapHoriz,
  Shield,
  Groups,
  MenuOpen,
  Close,
} from '@mui/icons-material';
import { Header } from '@/components/Header';
import { RewardPopup } from '@/components/RewardPopup';
import { AssetIcon } from '@/components/AssetIcon';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR, ACCENT_COLOR } from '@/lib/constants';

function Img({ src, size = 20, alt = '' }: { src: string; size?: number; alt?: string }) {
  return <Box component="img" src={src} alt={alt} sx={{ width: size, height: size, objectFit: 'contain' }} />;
}

/* ── Building blocks ─────────────────────────────────────────────── */

function SectionTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <Typography
      component="div"
      id={id}
      sx={{
        fontSize: { xs: '0.75rem', md: '0.85rem' },
        fontWeight: 600,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        mb: 2,
        mt: 6,
        scrollMarginTop: 80,
      }}
    >
      {children}
    </Typography>
  );
}

function StepCard({ step, title, desc }: { step: number; title: string; desc: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: { xs: 2, md: 2.5 },
        py: { xs: 2, md: 2.5 },
        bgcolor: '#0D1219',
        transition: 'background 0.15s ease',
        '&:hover': { background: 'rgba(255,255,255,0.03)' },
      }}
    >
      <Box
        sx={{
          width: 36, height: 36, borderRadius: '50%',
          bgcolor: 'rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)' }}>{step}</Typography>
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', mb: 0.25 }}>{title}</Typography>
        <Typography sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{desc}</Typography>
      </Box>
    </Box>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ bgcolor: '#0D1219', p: { xs: 1.5, md: 2 }, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.05em' }}>{label}</Typography>
      <Typography sx={{ fontSize: { xs: '0.95rem', md: '1.1rem' }, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  );
}

function DataRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, px: { xs: 1, sm: 1.5 }, gap: 1, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <Typography sx={{ fontSize: { xs: '0.8rem', sm: '0.9rem' }, color: 'rgba(255,255,255,0.65)', minWidth: 0 }}>{label}</Typography>
      <Typography sx={{ fontSize: { xs: '0.8rem', sm: '0.9rem' }, fontWeight: bold ? 700 : 500, fontVariantNumeric: 'tabular-nums', flexShrink: 0, textAlign: 'right' }}>{value}</Typography>
    </Box>
  );
}

function LevelRow({ level, title, xp, fee, mult, icon, tierColor }: { level: number; title: string; xp: string; fee: string; mult: string; icon: string; tierColor: string }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '40px 1fr 1fr 48px 48px', sm: '50px 1fr 1fr 60px 60px', md: '60px 1.2fr 1.2fr 100px 100px' },
        alignItems: 'center', py: 1, px: { xs: 0.75, sm: 1.5 },
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
        transition: 'background 0.15s ease',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box component="img" src={icon} alt={`Lv.${level}`} sx={{ width: { xs: 18, sm: 22 }, height: { xs: 18, sm: 22 } }} />
        <Typography sx={{ fontSize: { xs: '0.78rem', sm: '0.88rem' }, fontWeight: 700, color: tierColor }}>{level}</Typography>
      </Box>
      <Typography sx={{ fontSize: { xs: '0.75rem', sm: '0.85rem' }, fontWeight: 600, color: tierColor }}>{title}</Typography>
      <Typography sx={{ fontSize: { xs: '0.72rem', sm: '0.85rem' }, color: 'rgba(255,255,255,0.65)', fontVariantNumeric: 'tabular-nums' }}>{xp}</Typography>
      <Typography sx={{ fontSize: { xs: '0.72rem', sm: '0.85rem' }, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fee}</Typography>
      <Typography sx={{ fontSize: { xs: '0.72rem', sm: '0.85rem' }, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{mult}</Typography>
    </Box>
  );
}

/* ── Data ─────────────────────────────────────────────────────────── */

const LEVELS = [
  { level: 1, title: 'Newcomer', xp: '0', fee: '5.00%', mult: '1.0x', icon: '/Level/Level_1-4.png', color: 'rgba(255,255,255,0.5)' },
  { level: 5, title: 'Observer', xp: '11,915', fee: '4.75%', mult: '1.0x', icon: '/Level/Level_5-8.png', color: UP_COLOR },
  { level: 10, title: 'Analyst', xp: '97,362', fee: '4.50%', mult: '1.1x', icon: '/Level/Level_9-12.png', color: GAIN_COLOR },
  { level: 15, title: 'Trader', xp: '318,562', fee: '4.25%', mult: '1.2x', icon: '/Level/Level_13-16.png', color: ACCENT_COLOR },
  { level: 20, title: 'Veteran', xp: '730,569', fee: '4.00%', mult: '1.35x', icon: '/Level/Level_17-20.png', color: '#A78BFA' },
  { level: 25, title: 'Expert', xp: '1,384,587', fee: '3.75%', mult: '1.5x', icon: '/Level/Level_25-28.png', color: '#FB923C' },
  { level: 30, title: 'Legend', xp: '2,329,192', fee: '3.50%', mult: '1.7x', icon: '/Level/Level_29-32.png', color: '#F43F5E' },
  { level: 35, title: 'Titan', xp: '3,610,991', fee: '3.25%', mult: '1.9x', icon: '/Level/Level_33-36.png', color: '#E879F9' },
  { level: 40, title: 'Apex Legend', xp: '5,275,014', fee: '3.00%', mult: '2.0x', icon: '/Level/Level_37-40.png', color: '#FACC15' },
];

const ALLOCATIONS = [
  { label: 'Play-to-Earn', pct: 40, tokens: '4,000,000,000', color: '#22C55E', desc: 'Distributed to players through gameplay' },
  { label: 'Liquidity', pct: 15, tokens: '1,500,000,000', color: '#4ADE80', desc: 'DEX liquidity on Raydium / Orca' },
  { label: 'Team', pct: 15, tokens: '1,500,000,000', color: '#F59E0B', desc: '24-month vesting, 6-month cliff' },
  { label: 'Treasury', pct: 10, tokens: '1,000,000,000', color: '#A78BFA', desc: 'Protocol growth & partnerships' },
  { label: 'Community', pct: 10, tokens: '1,000,000,000', color: '#F472B6', desc: 'Community initiatives & early adopters' },
  { label: 'Marketing', pct: 5, tokens: '500,000,000', color: '#FB923C', desc: 'Exchange listings, campaigns, KOLs' },
  { label: 'Advisors', pct: 5, tokens: '500,000,000', color: '#E879F9', desc: '18-month vesting, 3-month cliff' },
];

const VESTING = [
  { label: 'Play-to-Earn', color: '#22C55E', cliff: 0, end: 30, note: 'Ongoing via gameplay' },
  { label: 'Liquidity', color: '#4ADE80', cliff: 0, end: 1, note: '100% at TGE' },
  { label: 'Team', color: '#F59E0B', cliff: 6, end: 30, note: '6mo cliff, 24mo linear' },
  { label: 'Treasury', color: '#A78BFA', cliff: 0, end: 12, note: '12mo linear' },
  { label: 'Community', color: '#F472B6', cliff: 0, end: 24, note: 'Airdrop waves' },
  { label: 'Marketing', color: '#FB923C', cliff: 0, end: 24, note: 'Per milestone' },
  { label: 'Advisors', color: '#E879F9', cliff: 3, end: 21, note: '3mo cliff, 18mo linear' },
];

const DONUT_R = 70;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;
const DONUT_SEGMENTS = (() => {
  let offset = 0;
  return ALLOCATIONS.map((a) => {
    const dashLen = (a.pct / 100) * DONUT_CIRC;
    const seg = { ...a, dashLen, offset };
    offset += dashLen;
    return seg;
  });
})();
const VESTING_MAX = 30;

interface NavItem { id: string; label: string }
interface NavGroup { group: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  { group: 'Getting Started', items: [
    { id: 'quick-start', label: 'Quick Start' },
    { id: 'how-pools-work', label: 'Pool Lifecycle' },
  ]},
  { group: 'Markets', items: [
    { id: 'assets-timeframes', label: 'Crypto Pools' },
    { id: 'sports-markets', label: 'Sports Markets' },
    { id: 'prediction-markets', label: 'Prediction Markets' },
    { id: 'odds-payouts', label: 'Odds & Payouts' },
    { id: 'claiming', label: 'Claiming Payouts' },
  ]},
  { group: 'Competitions', items: [
    { id: 'tournaments', label: 'Tournaments' },
    { id: 'squad-pools', label: 'Squad Pools' },
  ]},
  { group: 'Rewards', items: [
    { id: 'xp-rewards', label: 'XP & Rewards' },
    { id: 'levels', label: 'Level Progression' },
    { id: 'up-coins', label: 'UP Coins' },
    { id: 'referrals', label: 'Referral Program' },
  ]},
  { group: 'Platform', items: [
    { id: 'tokenomics', label: 'UP Token' },
    { id: 'security', label: 'Security' },
    { id: 'features', label: 'Features' },
    { id: 'tips', label: 'Tips' },
  ]},
];

const NAV_SECTIONS = NAV_GROUPS.flatMap(g => g.items);

/* ── Sidebar nav ─────────────────────────────────────────────────── */

function SidebarGroup({ group, items, activeId, onClose }: NavGroup & { activeId: string; onClose?: () => void }) {
  const hasActive = items.some(i => i.id === activeId);
  const [open, setOpen] = useState(hasActive);

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  return (
    <Box sx={{ mb: 0.5 }}>
      <Box
        onClick={() => setOpen(!open)}
        sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 2, py: 0.75, cursor: 'pointer',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
        }}
      >
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: hasActive ? '#fff' : 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {group}
        </Typography>
        <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
          {'>'}
        </Typography>
      </Box>
      {open && items.map((s) => (
        <Box
          key={s.id}
          component="a"
          href={`#${s.id}`}
          onClick={onClose}
          sx={{
            display: 'block',
            pl: 3.5, pr: 2, py: 0.5,
            textDecoration: 'none',
            fontSize: '0.8rem',
            fontWeight: activeId === s.id ? 600 : 400,
            color: activeId === s.id ? '#fff' : 'rgba(255,255,255,0.45)',
            borderLeft: activeId === s.id ? '2px solid #fff' : '2px solid transparent',
            transition: 'all 0.15s ease',
            '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.03)' },
          }}
        >
          {s.label}
        </Box>
      ))}
    </Box>
  );
}

function DocsSidebar({ activeId, onClose }: { activeId: string; onClose?: () => void }) {
  return (
    <Box sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', px: 2, mb: 1.5 }}>
        Documentation
      </Typography>
      {NAV_GROUPS.map((g) => (
        <SidebarGroup key={g.group} {...g} activeId={activeId} onClose={onClose} />
      ))}
    </Box>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function DocsPage() {
  const [activeId, setActiveId] = useState('quick-start');
  const [mobileNav, setMobileNav] = useState(false);

  // Track active section via IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );
    for (const s of NAV_SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: { xs: 'calc(72px + env(safe-area-inset-bottom, 0px))', lg: 0 } }}>
      <Header />
      <RewardPopup />

      <Box sx={{ display: 'flex', bgcolor: '#0B0F14' }}>
        {/* Desktop sidebar */}
        <Box
          sx={{
            display: { xs: 'none', lg: 'block' },
            width: 220,
            flexShrink: 0,
            position: 'sticky',
            top: 64,
            height: 'calc(100vh - 64px)',
            overflowY: 'auto',
            borderRight: '1px solid rgba(255,255,255,0.04)',
            '&::-webkit-scrollbar': { width: 3 },
            '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.08)', borderRadius: 2 },
          }}
        >
          <DocsSidebar activeId={activeId} />
        </Box>

        {/* Mobile nav toggle */}
        <IconButton
          onClick={() => setMobileNav(true)}
          sx={{
            display: { xs: 'flex', lg: 'none' },
            position: 'fixed',
            top: '50%',
            left: 0,
            transform: 'translateY(-50%)',
            zIndex: 99,
            bgcolor: '#0D1219',
            borderRight: '1px solid rgba(255,255,255,0.08)',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            borderTopRightRadius: 8,
            borderBottomRightRadius: 8,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            px: 0.5,
            py: 1.5,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
          }}
        >
          <MenuOpen sx={{ fontSize: 16, color: 'rgba(255,255,255,0.5)' }} />
        </IconButton>

        {/* Mobile drawer */}
        <Drawer
          anchor="left"
          open={mobileNav}
          onClose={() => setMobileNav(false)}
          sx={{
            display: { xs: 'block', lg: 'none' },
            '& .MuiDrawer-paper': { width: 240, backgroundColor: '#0B0F14 !important', backgroundImage: 'none', borderRight: '1px solid rgba(255,255,255,0.06)' },
            '& .MuiBackdrop-root': { bgcolor: 'rgba(0,0,0,0.6)' },
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
            <IconButton onClick={() => setMobileNav(false)} size="small" sx={{ color: 'text.secondary' }}>
              <Close sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
          <DocsSidebar activeId={activeId} onClose={() => setMobileNav(false)} />
        </Drawer>

        {/* Main content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 }, pb: { xs: 6, md: 8 } }}>

            {/* Hero */}
            <Box sx={{ textAlign: 'center', mb: 5, mt: { xs: 1, md: 2 } }}>
              <Box component="img" src="/updown-logos/Logo_text_white_796x277.png" alt="UpDown" sx={{ height: { xs: 36, md: 48 }, mb: 2 }} />
              <Typography sx={{ fontSize: { xs: '0.85rem', md: '1rem' }, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                Predict crypto prices. Stake USDC. Win the pool.
              </Typography>
            </Box>

            {/* ── Getting Started ─────────────────────────────────────── */}
            <SectionTitle id="quick-start">Getting Started</SectionTitle>
            <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
              <strong style={{ color: '#fff' }}>UpDown</strong> is a parimutuel prediction platform on Solana. Pick a crypto asset (BTC, ETH, SOL), predict whether its price will go <strong style={{ color: '#fff' }}>UP or DOWN</strong> within a timeframe, and stake USDC. If your side wins, you split the entire pool proportionally. All bets, payouts, and refunds happen on-chain — transparent and verifiable.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px', mb: 2 }}>
              <StepCard step={1} title="Connect Wallet" desc="Click Connect Wallet. Choose embedded (no extension) or external (Phantom, Solflare)." />
              <StepCard step={2} title="Fund Your Wallet" desc="Deposit USDC (Solana) into your wallet. You need USDC to place predictions and a small amount of SOL for transaction fees." />
              <StepCard step={3} title="Pick a Pool" desc="Browse Markets. Pools marked JOINING are open for predictions." />
              <StepCard step={4} title="Predict UP or DOWN" desc="Toggle your side, enter USDC stake, confirm the transaction." />
              <StepCard step={5} title="Wait for Result" desc="Pool locks (ACTIVE) and resolves after 3 min - 1 hour." />
              <StepCard step={6} title="Claim Winnings" desc="Go to Profile > Resolved tab, click Claim Payout. UP Coins and XP are awarded on claim." />
            </Box>

            {/* ── Pool Lifecycle ──────────────────────────────────────── */}
            <SectionTitle id="how-pools-work">Pool Lifecycle</SectionTitle>
            <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
              A <strong style={{ color: '#fff' }}>strike price</strong> is captured when the pool opens. A <strong style={{ color: '#fff' }}>final price</strong> when it ends.
              If final &gt; strike, <strong style={{ color: '#fff' }}>UP wins</strong>. If lower, <strong style={{ color: '#fff' }}>DOWN wins</strong>.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: '3px', mb: 2 }}>
              {[
                { label: 'JOINING', desc: 'Place predictions' },
                { label: 'ACTIVE', desc: 'Bets locked' },
                { label: 'RESOLVED', desc: 'Winner decided' },
                { label: 'CLAIMABLE', desc: 'Claim payouts' },
              ].map((s) => (
                <Box key={s.label} sx={{ bgcolor: '#0D1219', p: { xs: 1.25, md: 2 }, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography sx={{ fontSize: { xs: '0.72rem', md: '0.85rem' }, fontWeight: 700, letterSpacing: '0.08em' }}>{s.label}</Typography>
                  <Typography sx={{ fontSize: { xs: '0.78rem', md: '0.88rem' }, color: 'rgba(255,255,255,0.6)' }}>{s.desc}</Typography>
                </Box>
              ))}
            </Box>

            {/* ── Assets & Timeframes ─────────────────────────────────── */}
            <SectionTitle id="assets-timeframes">Assets & Timeframes</SectionTitle>
            <Box sx={{ bgcolor: '#0D1219', p: { xs: 2, md: 3 }, mb: 2 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 2 }}>ASSETS</Typography>
              <Box sx={{ display: 'flex', gap: { xs: 2, md: 4 }, mb: 3, justifyContent: 'center' }}>
                {['BTC', 'ETH', 'SOL'].map((a) => (
                  <Box key={a} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <AssetIcon asset={a} size={48} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>{a}</Typography>
                  </Box>
                ))}
              </Box>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 2 }}>TIMEFRAMES</Typography>
              <Box sx={{ display: 'flex', gap: { xs: 1.5, md: 3 }, flexWrap: 'wrap', justifyContent: 'center' }}>
                {[
                  { key: '3m', img: '/assets/turbo-tag.png' },
                  { key: '5m', img: '/assets/rapid-tag.png' },
                  { key: '15m', img: '/assets/short-tag.png' },
                  { key: '1h', img: '/assets/hourly-tag.png' },
                ].map((t) => (
                  <Box key={t.key} component="img" src={t.img} alt={t.key} sx={{ width: { xs: 80, sm: 100, md: 120 }, height: { xs: 80, sm: 100, md: 120 }, objectFit: 'contain' }} />
                ))}
              </Box>
            </Box>

            {/* ── Sports Markets ──────────────────────────────────────── */}
            <SectionTitle id="sports-markets">Sports Markets</SectionTitle>
            <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
              Predict football match outcomes: <strong style={{ color: UP_COLOR }}>Home</strong>, <strong style={{ color: DOWN_COLOR }}>Away</strong>, or <strong style={{ color: ACCENT_COLOR }}>Draw</strong> (3-way parimutuel).
            </Typography>
            <Box sx={{ bgcolor: '#0D1219', p: { xs: 2, md: 3 }, mb: 2 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 2 }}>LEAGUES</Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {[
                  { code: 'CL', name: 'Champions League' },
                  { code: 'PL', name: 'Premier League' },
                  { code: 'PD', name: 'La Liga' },
                  { code: 'SA', name: 'Serie A' },
                  { code: 'BL1', name: 'Bundesliga' },
                  { code: 'FL1', name: 'Ligue 1' },
                  { code: 'bsa', name: 'Brasileirao' },
                ].map((l) => (
                  <Box key={l.code} sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(255,255,255,0.04)', px: 1.5, py: 0.75, borderRadius: '6px' }}>
                    <Box component="img" src={`https://crests.football-data.org/${l.code}.png`} alt="" sx={{ width: 20, height: 20, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '2px' }} />
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{l.name}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ mt: 3 }}>
                <Typography component="div" sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', py: 0.4, pl: 2, position: 'relative', '&::before': { content: '"•"', position: 'absolute', left: 0, color: UP_COLOR } }}>Fixtures synced daily from football-data.org (14 days ahead)</Typography>
                <Typography component="div" sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', py: 0.4, pl: 2, position: 'relative', '&::before': { content: '"•"', position: 'absolute', left: 0, color: UP_COLOR } }}>Results checked every 5 min during match windows</Typography>
                <Typography component="div" sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', py: 0.4, pl: 2, position: 'relative', '&::before': { content: '"•"', position: 'absolute', left: 0, color: UP_COLOR } }}>AI-generated H2H analysis for each match</Typography>
                <Typography component="div" sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', py: 0.4, pl: 2, position: 'relative', '&::before': { content: '"•"', position: 'absolute', left: 0, color: UP_COLOR } }}>Pools resolve automatically when the match finishes</Typography>
              </Box>
            </Box>

            {/* ── Prediction Markets ─────────────────────────────────────── */}
            <SectionTitle id="prediction-markets">Prediction Markets</SectionTitle>
            <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
              Predict real-world events: <strong style={{ color: UP_COLOR }}>Yes</strong> or <strong style={{ color: DOWN_COLOR }}>No</strong>. Powered by Polymarket data with on-chain USDC pools.
            </Typography>
            <Box sx={{ bgcolor: '#0D1219', p: { xs: 2, md: 3 }, mb: 2 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 2 }}>CATEGORIES</Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
                {[
                  { name: 'Politics', color: '#A78BFA' },
                  { name: 'Geopolitics', color: '#60A5FA' },
                  { name: 'Culture', color: '#F472B6' },
                  { name: 'Finance', color: '#34D399' },
                ].map((c) => (
                  <Box key={c.name} sx={{ px: 2, py: 0.75, borderRadius: '6px', bgcolor: `${c.color}15`, border: `1px solid ${c.color}30` }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: c.color }}>{c.name}</Typography>
                  </Box>
                ))}
              </Box>
              <Typography component="div" sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', py: 0.4, pl: 2, position: 'relative', '&::before': { content: '"•"', position: 'absolute', left: 0, color: UP_COLOR } }}>Global odds chart from Polymarket (auto-refreshes every 30s)</Typography>
              <Typography component="div" sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', py: 0.4, pl: 2, position: 'relative', '&::before': { content: '"•"', position: 'absolute', left: 0, color: UP_COLOR } }}>UpDown platform odds chart (live via WebSocket)</Typography>
              <Typography component="div" sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', py: 0.4, pl: 2, position: 'relative', '&::before': { content: '"•"', position: 'absolute', left: 0, color: UP_COLOR } }}>Toggle between Polymarket and UpDown data sources</Typography>
              <Typography component="div" sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', py: 0.4, pl: 2, position: 'relative', '&::before': { content: '"•"', position: 'absolute', left: 0, color: UP_COLOR } }}>Market Rules and Context tabs show resolution criteria</Typography>
              <Typography component="div" sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', py: 0.4, pl: 2, position: 'relative', '&::before': { content: '"•"', position: 'absolute', left: 0, color: UP_COLOR } }}>Pools resolve when Polymarket marks the event as resolved (~10 min check)</Typography>
            </Box>

            {/* ── Odds & Payouts ──────────────────────────────────────── */}
            <SectionTitle id="odds-payouts">Odds & Payouts</SectionTitle>
            <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
              <strong style={{ color: '#fff' }}>Parimutuel</strong>: winners split the entire pool proportionally. Odds update in real-time as bets come in.
            </Typography>
            <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
              <DataRow label="Your Stake" value="$100 on UP" />
              <DataRow label="Odds" value="1.50x" />
              <DataRow label="Gross Payout" value="$150.00" />
              <DataRow label="Platform Fee (5%)" value="-$7.50" />
              <DataRow label="You Receive" value="$142.50" bold />
            </Box>
            <Box sx={{ bgcolor: '#0D1219', borderLeft: '3px solid rgba(255,255,255,0.15)', px: 2, py: 1.5, mb: 2 }}>
              <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                If a pool is one-sided (everyone bet the same direction), all bets are <strong style={{ color: '#fff' }}>refunded</strong>.
              </Typography>
            </Box>

            {/* ── Claiming ────────────────────────────────────────────── */}
            <SectionTitle id="claiming">Claiming Payouts</SectionTitle>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: '3px', mb: 2 }}>
              {[
                { title: 'From Profile', desc: 'Go to /profile > Resolved tab > Claim Payout' },
                { title: 'Claim All', desc: 'Multiple wins? Use the Claim All banner to batch-claim' },
                { title: 'From Pool', desc: 'Open the resolved pool and claim directly' },
              ].map((c) => (
                <Box key={c.title} sx={{ bgcolor: '#0D1219', p: 2 }}>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, mb: 0.5 }}>{c.title}</Typography>
                  <Typography sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{c.desc}</Typography>
                </Box>
              ))}
            </Box>

            {/* ── Squad Pools ─────────────────────────────────────────── */}
            <SectionTitle id="squad-pools">Squad Pools</SectionTitle>
            <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
              Private pools between friends. Create a squad, invite friends with a code, and play pools that only your squad can see and bet on. Same parimutuel mechanics, same on-chain flow, but private.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px', mb: 2 }}>
              <StepCard step={1} title="Create a Squad" desc="Go to Squads page and create one. You become the Owner." />
              <StepCard step={2} title="Invite Friends" desc="Share your invite code or link. Friends open the link, connect wallet, and join." />
              <StepCard step={3} title="Create Private Pools" desc="Any member can create a pool: choose asset (BTC/ETH/SOL), duration (3m to 1h), and optional max players." />
              <StepCard step={4} title="Play Together" desc="Only squad members can see and bet on squad pools. Same UP/DOWN mechanics." />
              <StepCard step={5} title="Automatic Resolution" desc="Pools resolve automatically like public pools. Claims, refunds, XP and coins all work the same." />
              <StepCard step={6} title="Chat & Leaderboard" desc="Squad chat for trash talk. Leaderboard tracks W/L and PnL within the squad." />
            </Box>

            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>SQUAD DETAILS</Typography>
            <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
              <DataRow label="Max members per squad" value="20" />
              <DataRow label="Who can create pools" value="Any member" />
              <DataRow label="Pool visibility" value="Squad members only" />
              <DataRow label="Invite code" value="8-character random code" />
              <DataRow label="Owner privileges" value="Kick members" />
              <DataRow label="Squad pools in public markets" value="Hidden" />
              <DataRow label="Resolution & claims" value="Identical to public pools" />
            </Box>

            {/* ── Tournaments ────────────────────────────────────────── */}
            <SectionTitle id="tournaments">Tournaments</SectionTitle>
            <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
              Single-elimination bracket tournaments. Pay an entry fee, predict prices in 1v1 matches, and the last player standing wins the entire prize pool.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px', mb: 2 }}>
              <StepCard step={1} title="Register" desc="Pay the entry fee to join. All entry fees go directly into the prize pool." />
              <StepCard step={2} title="Bracket" desc="Players are placed in a single-elimination bracket. Each round is a 1v1 match." />
              <StepCard step={3} title="Predict" desc="Before each match, both players have a limited time window to predict the closing price of the asset (e.g. BTC/USD)." />
              <StepCard step={4} title="Match resolves" desc="After predictions close, the match runs for the configured duration while the price moves. When it ends, the player closest to the final price advances." />
              <StepCard step={5} title="Repeat" desc="Winners advance through the bracket — semifinals, finals — until one player remains." />
              <StepCard step={6} title="Claim prize" desc="The tournament winner can claim the full prize pool (minus 5% platform fee) directly to their wallet." />
            </Box>

            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>TOURNAMENT DETAILS</Typography>
            <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
              <DataRow label="Format" value="Single elimination" />
              <DataRow label="Match type" value="1v1 price prediction" />
              <DataRow label="Winning condition" value="Closest to final price" />
              <DataRow label="Prediction window" value="Set per tournament" />
              <DataRow label="Match duration" value="Set per tournament" />
              <DataRow label="Platform fee" value="5% of prize pool" bold />
              <DataRow label="Prize payout" value="USDC on-chain" />
              <DataRow label="Missed prediction" value="Opponent advances" />
            </Box>

            <Box sx={{ bgcolor: '#0D1219', borderLeft: '3px solid rgba(255,255,255,0.15)', px: 2, py: 1.5, mb: 2 }}>
              <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                <strong style={{ color: '#fff' }}>Example:</strong> An 8-player tournament with a $10 entry fee creates an $80 prize pool. After 3 rounds of 1v1 matches, the winner claims <strong style={{ color: '#fff' }}>$76.00 USDC</strong> (pool minus 5% fee).
              </Typography>
            </Box>

            {/* ── Referral Program ────────────────────────────────────── */}
            <SectionTitle id="referrals">Referral Program</SectionTitle>
            <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
              Invite friends and earn <strong style={{ color: '#fff' }}>1% of their bet amounts</strong> as USDC commission every time a pool resolves normally. No extra cost to them.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px', mb: 2 }}>
              <StepCard step={1} title="Share Your Link" desc="Go to Referrals page or click the share icon on your profile. Copy your unique referral link." />
              <StepCard step={2} title="Friend Opens Link" desc="They open the link. If not connected, a banner shows they were invited. Once they connect, a dialog asks them to accept." />
              <StepCard step={3} title="They Play" desc="Your friend places bets normally. Every time a pool they bet in resolves (not a refund), you earn 1% of their bet amount." />
              <StepCard step={4} title="Claim Earnings" desc="Go to Referrals page. When your unpaid balance reaches $1, click Claim. USDC is sent directly to your wallet on-chain." />
            </Box>

            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>HOW IT WORKS</Typography>
            <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
              <DataRow label="Referrer reward on accept" value="+500 XP + 50 UP Coins" bold />
              <DataRow label="Commission rate" value="1% of bet amount" bold />
              <DataRow label="When earned" value="Pool resolves normally" />
              <DataRow label="Refunded pools" value="No commission" />
              <DataRow label="Minimum claim" value="$1.00 USDC" />
              <DataRow label="Payout method" value="USDC transfer on-chain" />
              <DataRow label="Self-referral" value="Blocked" />
            </Box>

            <Box sx={{ bgcolor: '#0D1219', borderLeft: '3px solid rgba(255,255,255,0.15)', px: 2, py: 1.5, mb: 2 }}>
              <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                <strong style={{ color: '#fff' }}>Example:</strong> Your friend bets $100 on a pool. The pool resolves with a winner. You earn <strong style={{ color: '#fff' }}>$1.00 USDC</strong> regardless of whether your friend won or lost.
              </Typography>
            </Box>

            {/* ── XP & Rewards ────────────────────────────────────────── */}
            <SectionTitle id="xp-rewards">XP & Rewards</SectionTitle>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: '3px', mb: 2 }}>
              <InfoCard label="BET PLACED" value="+100 XP" />
              <InfoCard label="DAILY FIRST BET" value="+200 XP" />
              <InfoCard label="BET WON" value="+150 XP" />
              <InfoCard label="CLAIM COMPLETED" value="+50 XP" />
            </Box>

            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>WIN STREAK XP BONUS</Typography>
            <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
              <DataRow label="3 consecutive wins" value="+100 XP" />
              <DataRow label="4 consecutive wins" value="+200 XP" />
              <DataRow label="5 consecutive wins" value="+300 XP" />
              <DataRow label="10+ consecutive wins (cap)" value="+800 XP" bold />
            </Box>

            {/* ── Level Progression ───────────────────────────────────── */}
            <SectionTitle id="levels">Level Progression (1-40)</SectionTitle>
            <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
              Higher levels unlock lower fees and higher coin multipliers. XP curve: <strong style={{ color: '#fff' }}>500 x (level - 1)^1.8</strong> per level.
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '40px 1fr 1fr 48px 48px', sm: '50px 1fr 1fr 60px 60px', md: '60px 1.2fr 1.2fr 100px 100px' },
                py: 1, px: { xs: 0.75, sm: 1.5 }, bgcolor: '#0D1219', borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {['LVL', 'TITLE', 'TOTAL XP', 'FEE', 'COINS'].map((h) => (
                <Typography key={h} sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em' }}>{h}</Typography>
              ))}
            </Box>
            <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
              {LEVELS.map((l) => (
                <LevelRow key={l.level} level={l.level} title={l.title} xp={l.xp} fee={l.fee} mult={l.mult} icon={l.icon} tierColor={l.color} />
              ))}
            </Box>

            {/* ── UP Coins ────────────────────────────────────────────── */}
            <SectionTitle id="up-coins">UP Coins</SectionTitle>
            <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
              Coins are <strong style={{ color: '#fff' }}>only awarded when you claim</strong> a winning bet, never at deposit time.
            </Typography>

            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>EARNING SOURCES</Typography>
            <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
              <DataRow label="Base bet coins" value="$amount x 0.10 UP x level mult" />
              <DataRow label="Win bonus" value="50% of base x level mult" />
              <DataRow label="Streak bonus (3+ wins)" value="min(streak x 2.00, 20.00) UP" />
              <DataRow label="Level-up bonus" value="newLevel x 5.00 UP" />
            </Box>

            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>DAILY LIMITS</Typography>
            <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
              <DataRow label="Daily cap per wallet" value="500 UP max" bold />
              <DataRow label="Minimum bet for coins" value="$1 USDC" />
              <DataRow label="Bets 1-20 / day" value="100% rate" />
              <DataRow label="Bets 21-40 / day" value="50% rate" />
              <DataRow label="Bets 41+ / day" value="0%, no coins" />
            </Box>

            {/* ── Tokenomics ──────────────────────────────────────────── */}
            <SectionTitle id="tokenomics">UP Token Tokenomics</SectionTitle>
            <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
              The <strong style={{ color: '#fff' }}>UP Token</strong> is the native cryptocurrency of UpDown, built on Solana (SPL).
              UP Coins earned in-app will convert to UP Tokens at launch.
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: '3px', mb: 2 }}>
              <InfoCard label="TOTAL SUPPLY" value="10,000,000,000" />
              <InfoCard label="BLOCKCHAIN" value="Solana (SPL)" />
              <InfoCard label="TICKER" value="$UP" />
              <InfoCard label="DECIMALS" value="6" />
            </Box>

            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>TOKEN DISTRIBUTION</Typography>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center', gap: { xs: 2, md: 4 }, bgcolor: '#0D1219', p: { xs: 2, md: 3 }, mb: '3px' }}>
              {/* Donut Chart */}
              <Box sx={{ position: 'relative', flexShrink: 0, width: { xs: 170, sm: 200, md: 220 }, height: { xs: 170, sm: 200, md: 220 } }}>
                <svg viewBox="0 0 220 220" width="100%" height="100%">
                  {DONUT_SEGMENTS.map((seg) => (
                    <Tooltip
                      key={seg.label}
                      title={<Box sx={{ textAlign: 'center', py: 0.5 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: seg.color }}>{seg.label}</Typography>
                        <Typography sx={{ fontSize: '0.8rem' }}>{seg.pct}% &middot; {seg.tokens} UP</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>{seg.desc}</Typography>
                      </Box>}
                      arrow
                      slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', maxWidth: 220 } }, arrow: { sx: { color: '#1a1f2e' } } }}
                    >
                      <circle
                        cx="110"
                        cy="110"
                        r={DONUT_R}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="28"
                        strokeDasharray={`${seg.dashLen} ${DONUT_CIRC}`}
                        strokeDashoffset={-seg.offset}
                        style={{ transform: 'rotate(-90deg)', transformOrigin: '110px 110px', cursor: 'pointer', transition: 'stroke-width 0.15s' }}
                      />
                    </Tooltip>
                  ))}
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>TOTAL</Typography>
                  <Typography sx={{ fontSize: { xs: '1rem', md: '1.2rem' }, fontWeight: 800, color: '#FACC15' }}>10B</Typography>
                  <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>$UP</Typography>
                </Box>
              </Box>
              {/* Legend */}
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.25, width: '100%' }}>
                {ALLOCATIONS.map((a) => (
                  <Tooltip key={a.label} title={`${a.tokens} UP - ${a.desc}`} placement="left" arrow slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.78rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', py: 0.25, mx: -0.5, px: 0.5, borderRadius: '4px', transition: 'background 0.15s', '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' } }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: a.color, flexShrink: 0 }} />
                      <Typography sx={{ fontSize: { xs: '0.82rem', md: '0.88rem' }, fontWeight: 600, color: a.color, flex: 1 }}>{a.label}</Typography>
                      <Typography sx={{ fontSize: { xs: '0.82rem', md: '0.88rem' }, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{a.pct}%</Typography>
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            </Box>

            {/* Vesting Timeline */}
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1, mt: 2 }}>VESTING SCHEDULE</Typography>
            <Box sx={{ bgcolor: '#0D1219', p: { xs: 1.5, md: 2.5 }, mb: '3px' }}>
              <Box sx={{ display: 'flex', ml: { xs: '65px', sm: '80px', md: '100px' }, mr: { xs: '70px', sm: '90px', md: '120px' }, mb: 1 }}>
                {[0, 6, 12, 18, 24, 30].map((m) => (
                  <Typography key={m} sx={{ fontSize: { xs: '0.58rem', md: '0.68rem' }, color: 'rgba(255,255,255,0.3)', flex: 1 }}>
                    {m === 0 ? 'TGE' : `${m}mo`}
                  </Typography>
                ))}
              </Box>
              {VESTING.map((v) => (
                <Tooltip
                  key={v.label}
                  title={<Box sx={{ py: 0.5 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: v.color }}>{v.label}</Typography>
                    {v.cliff > 0 && <Typography sx={{ fontSize: '0.78rem' }}>Cliff: {v.cliff} months</Typography>}
                    <Typography sx={{ fontSize: '0.78rem' }}>Vesting: month {v.cliff} to {v.end}</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>{v.note}</Typography>
                  </Box>}
                  arrow
                  placement="top"
                  slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', maxWidth: 200 } }, arrow: { sx: { color: '#1a1f2e' } } }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75, gap: { xs: 0.75, md: 1.5 }, cursor: 'pointer', py: 0.25, borderRadius: '4px', transition: 'background 0.15s', '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                    <Typography sx={{ fontSize: { xs: '0.65rem', md: '0.78rem' }, color: v.color, fontWeight: 600, width: { xs: 55, sm: 70, md: 90 }, flexShrink: 0, textAlign: 'right' }}>{v.label}</Typography>
                    <Box sx={{ flex: 1, height: { xs: 14, md: 18 }, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '3px', position: 'relative', overflow: 'hidden' }}>
                      {v.cliff > 0 && (
                        <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(v.cliff / VESTING_MAX) * 100}%`, bgcolor: `${v.color}10`, borderRight: `1px dashed ${v.color}50` }} />
                      )}
                      <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${(v.cliff / VESTING_MAX) * 100}%`, width: `${((v.end - v.cliff) / VESTING_MAX) * 100}%`, background: `linear-gradient(90deg, ${v.color}90, ${v.color}50)`, borderRadius: '3px' }} />
                    </Box>
                    <Typography sx={{ fontSize: { xs: '0.55rem', md: '0.68rem' }, color: 'rgba(255,255,255,0.4)', width: { xs: 65, sm: 80, md: 110 }, flexShrink: 0 }}>{v.note}</Typography>
                  </Box>
                </Tooltip>
              ))}
            </Box>

            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>TOKEN UTILITY</Typography>
            <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
              <DataRow label="Fee Discounts" value="Pay fees in $UP for up to 50% discount" />
              <DataRow label="Staking Rewards" value="Earn share of platform fee revenue" />
              <DataRow label="Governance" value="Vote on assets, fees, treasury" />
              <DataRow label="Exclusive Pools" value="High-stakes pools for $UP holders" />
              <DataRow label="Boosted Earnings" value="Burn $UP for 2x coin multiplier" />
            </Box>

            <Box sx={{ bgcolor: '#0D1219', borderLeft: '3px solid rgba(255,255,255,0.15)', px: 2, py: 1.5, mb: 2 }}>
              <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                <strong style={{ color: '#fff' }}>Early Player Advantage:</strong> UP Coins earned now will convert to $UP tokens at launch.
                The earlier you play, the more tokens you accumulate.
              </Typography>
            </Box>

            {/* ── Security ────────────────────────────────────────────── */}
            <SectionTitle id="security">Security & Transparency</SectionTitle>
            <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
              Every pool, deposit, payout and refund happens on the <strong style={{ color: '#fff' }}>Solana blockchain</strong>.
              All transactions are public and verifiable.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px', mb: 2 }}>
              {[
                { title: 'Wallet via Privy', desc: 'Embedded or external wallet. Privy handles key management. UpDown never has access to your private keys.' },
                { title: 'Pool Creation (On-Chain)', desc: 'Each pool creates a unique PDA and vault on Solana. Only the smart contract controls the vault.' },
                { title: 'Market Data by Pacifica', desc: 'Strike and final prices from pacifica.fi, written on-chain and publicly verifiable.' },
                { title: 'Deposits', desc: 'USDC transferred directly from your wallet to the on-chain vault. Platform never holds funds.' },
                { title: 'Resolution', desc: 'Smart contract compares final vs strike price. Result recorded on-chain permanently.' },
                { title: 'Payouts & Claims', desc: 'Smart contract transfers USDC from vault to your wallet. Fees are level-based (5% to 3%).' },
                { title: 'Refunds', desc: 'One-sided pools are automatically refunded in full, no fees. No action required.' },
              ].map((item) => (
                <Box key={item.title} sx={{ bgcolor: '#0D1219', px: { xs: 2, md: 2.5 }, py: { xs: 1.5, md: 2 }, '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' }, transition: 'background 0.15s ease' }}>
                  <Typography sx={{ fontSize: { xs: '0.88rem', md: '0.95rem' }, fontWeight: 700, mb: 0.25 }}>{item.title}</Typography>
                  <Typography sx={{ fontSize: { xs: '0.82rem', md: '0.9rem' }, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{item.desc}</Typography>
                </Box>
              ))}
            </Box>

            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>ON-CHAIN ARCHITECTURE</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: '3px', mb: 2 }}>
              <Box sx={{ bgcolor: '#0D1219', p: { xs: 1.5, md: 2 } }}>
                <DataRow label="Blockchain" value="Solana" />
                <DataRow label="Framework" value="Anchor (Rust)" />
                <DataRow label="Token" value="USDC (SPL)" />
                <DataRow label="Vault type" value="PDA Token Account" />
                <DataRow label="Vault authority" value="Program only" />
              </Box>
              <Box sx={{ bgcolor: '#0D1219', p: { xs: 1.5, md: 2 } }}>
                <DataRow label="Pool data" value="PDA per pool" />
                <DataRow label="Bet records" value="PDA per user per pool" />
                <DataRow label="USDC vault" value="PDA token account" />
                <DataRow label="Strike & final price" value="Stored on pool PDA" />
                <DataRow label="Winner side" value="Written at resolution" />
              </Box>
            </Box>

            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>WHO SIGNS WHAT</Typography>
            <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
              <DataRow label="Deposit" value="You sign" />
              <DataRow label="Claim payout" value="You + Platform co-sign" />
              <DataRow label="Pool resolution" value="Platform signs" />
              <DataRow label="Refund" value="Platform signs (automatic)" />
            </Box>

            {/* ── Features ────────────────────────────────────────────── */}
            <SectionTitle id="features">Features</SectionTitle>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: '3px', mb: 2 }}>
              {[
                { title: 'Markets', desc: 'Filter by asset, interval, status. Real-time pool updates via WebSocket.' },
                { title: 'Pool Detail', desc: 'Live price chart, strike vs final, UP/DOWN arena, bet form with presets, payout preview.' },
                { title: 'Squad Pools', desc: 'Private pools for friends. Create squads, invite with codes, squad chat & leaderboard.' },
                { title: 'Referral Program', desc: 'Earn 1% USDC commission on referred users bets. Claimable on-chain.' },
                { title: 'Tournaments', desc: 'Single-elimination brackets. 1v1 price predictions, closest to final price wins. Prize pool on-chain.' },
                { title: 'Profile', desc: 'Stats, level badge, XP progress, USDC & UP Coins balance, bet history.' },
                { title: 'Leaderboard', desc: 'Rankings by XP, Coins, or Level. Gold/Silver/Bronze medals.' },
                { title: 'AI Analyzer Bot', desc: 'Draggable bot on pool pages. RSI, MACD, EMA, Bollinger analysis.' },
                { title: 'Notifications', desc: 'Real-time alerts for wins, losses, claims, XP, coins, level ups, refunds.' },
              ].map((f) => (
                <Box key={f.title} sx={{ bgcolor: '#0D1219', p: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' }, transition: 'background 0.15s ease' }}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5 }}>{f.title}</Typography>
                  <Typography sx={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{f.desc}</Typography>
                </Box>
              ))}
            </Box>

            {/* ── Tips ────────────────────────────────────────────────── */}
            <SectionTitle id="tips">Tips</SectionTitle>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {[
                'Start small, $10-$50 bets to learn how odds shift.',
                'Watch the odds. Early bets on the minority side get better multipliers.',
                'Level up! Fees drop from 5.00% to 3.00% and coin multiplier goes up to 2.0x.',
                'Use the AI Bot on pool detail pages for technical analysis.',
                'Claim promptly. Don\'t forget winning bets in Profile > Resolved.',
                'Create a squad and invite friends for private competitive pools.',
                'Share your referral link to earn 1% USDC on every bet your friends place.',
              ].map((tip, i) => (
                <Box key={i} sx={{ bgcolor: '#0D1219', borderLeft: '3px solid rgba(255,255,255,0.1)', px: 2, py: 1.5 }}>
                  <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                    <strong style={{ color: 'rgba(255,255,255,0.4)' }}>#{i + 1}</strong> {tip}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Link to privacy */}
            <Box sx={{ mt: 6, mb: 2, textAlign: 'center' }}>
              <Typography
                component="a"
                href="/privacy"
                sx={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', textDecoration: 'none', '&:hover': { color: '#fff' }, transition: 'color 0.15s' }}
              >
                Disclaimer & Privacy Policy
              </Typography>
            </Box>

          </Container>
        </Box>
      </Box>
    </Box>
  );
}
