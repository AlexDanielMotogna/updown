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
  { label: 'Play-to-Earn', pct: 40, tokens: '4,000,000,000', desc: 'Distributed to players through gameplay' },
  { label: 'Liquidity', pct: 15, tokens: '1,500,000,000', desc: 'DEX liquidity on Raydium / Orca' },
  { label: 'Team', pct: 15, tokens: '1,500,000,000', desc: '24-month vesting, 6-month cliff' },
  { label: 'Treasury', pct: 10, tokens: '1,000,000,000', desc: 'Protocol growth & partnerships' },
  { label: 'Community', pct: 10, tokens: '1,000,000,000', desc: 'Community initiatives & early adopters' },
  { label: 'Marketing', pct: 5, tokens: '500,000,000', desc: 'Exchange listings, campaigns, KOLs' },
  { label: 'Advisors', pct: 5, tokens: '500,000,000', desc: '18-month vesting, 3-month cliff' },
];

const NAV_SECTIONS = [
  { id: 'quick-start', label: 'Getting Started' },
  { id: 'how-pools-work', label: 'Pool Lifecycle' },
  { id: 'assets-timeframes', label: 'Assets & Timeframes' },
  { id: 'odds-payouts', label: 'Odds & Payouts' },
  { id: 'claiming', label: 'Claiming Payouts' },
  { id: 'squad-pools', label: 'Squad Pools' },
  { id: 'referrals', label: 'Referral Program' },
  { id: 'xp-rewards', label: 'XP & Rewards' },
  { id: 'levels', label: 'Level Progression' },
  { id: 'up-coins', label: 'UP Coins' },
  { id: 'tokenomics', label: 'UP Token' },
  { id: 'security', label: 'Security' },
  { id: 'features', label: 'Features' },
  { id: 'tips', label: 'Tips' },
];

/* ── Sidebar nav ─────────────────────────────────────────────────── */

function DocsSidebar({ activeId, onClose }: { activeId: string; onClose?: () => void }) {
  return (
    <Box sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', px: 2, mb: 1 }}>
        Documentation
      </Typography>
      {NAV_SECTIONS.map((s) => (
        <Box
          key={s.id}
          component="a"
          href={`#${s.id}`}
          onClick={onClose}
          sx={{
            display: 'block',
            px: 2,
            py: 0.75,
            textDecoration: 'none',
            fontSize: '0.82rem',
            fontWeight: activeId === s.id ? 600 : 400,
            color: activeId === s.id ? '#fff' : 'rgba(255,255,255,0.5)',
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
            <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
              {ALLOCATIONS.map((a) => (
                <DataRow key={a.label} label={`${a.label} (${a.pct}%)`} value={`${a.tokens} UP`} />
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
