'use client';

import { Box, Container, Typography, Tooltip } from '@mui/material';
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
} from '@mui/icons-material';
import { AppShell } from '@/components';
import { AssetIcon } from '@/components/AssetIcon';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR, ACCENT_COLOR } from '@/lib/constants';

function Img({ src, size = 20, alt = '' }: { src: string; size?: number; alt?: string }) {
  return <Box component="img" src={src} alt={alt} sx={{ width: size, height: size, objectFit: 'contain' }} />;
}

/* ── Reusable doc building blocks (matching app design) ──────────────── */

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
      }}
    >
      {children}
    </Typography>
  );
}

function InfoCard({
  icon,
  label,
  value,
  color = '#fff',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Box
      sx={{
        bgcolor: 'rgba(255,255,255,0.03)',
        borderRadius: '8px',
        p: { xs: 1.5, md: 2 },
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {icon}
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.05em' }}>
          {label}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: { xs: '0.95rem', md: '1.1rem' }, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Box>
  );
}

function StepCard({
  step,
  title,
  desc,
  color,
}: {
  step: number;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: { xs: 2, md: 2.5 },
        py: { xs: 2, md: 2.5 },
        background: `linear-gradient(135deg, ${color}12, ${color}04)`,
        transition: 'background 0.2s ease',
        '&:hover': { background: 'rgba(255,255,255,0.03)' },
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          bgcolor: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color }}>{step}</Typography>
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', mb: 0.25 }}>{title}</Typography>
        <Typography sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{desc}</Typography>
      </Box>
    </Box>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        py: 0.5,
        bgcolor: `${color}15`,
        borderRadius: '2px',
      }}
    >
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color, letterSpacing: '0.08em' }}>{label}</Typography>
    </Box>
  );
}

function DataRow({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        py: 1,
        px: { xs: 1, sm: 1.5 },
        gap: 1,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <Typography sx={{ fontSize: { xs: '0.8rem', sm: '0.9rem' }, color: 'rgba(255,255,255,0.65)', minWidth: 0 }}>{label}</Typography>
      <Typography sx={{ fontSize: { xs: '0.8rem', sm: '0.9rem' }, fontWeight: bold ? 700 : 500, color: color || '#fff', fontVariantNumeric: 'tabular-nums', flexShrink: 0, textAlign: 'right' }}>{value}</Typography>
    </Box>
  );
}

function LevelRow({
  level,
  title,
  xp,
  fee,
  mult,
  icon,
  tierColor,
}: {
  level: number;
  title: string;
  xp: string;
  fee: string;
  mult: string;
  icon: string;
  tierColor: string;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '40px 1fr 1fr 48px 48px', sm: '50px 1fr 1fr 60px 60px', md: '60px 1.2fr 1.2fr 100px 100px' },
        alignItems: 'center',
        py: 1,
        px: { xs: 0.75, sm: 1.5 },
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
        transition: 'background 0.15s ease',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box component="img" src={icon} alt={`Lv.${level}`} sx={{ width: { xs: 18, sm: 22 }, height: { xs: 18, sm: 22 } }} />
        <Typography sx={{ fontSize: { xs: '0.78rem', sm: '0.88rem' }, fontWeight: 700, color: tierColor }}>{level}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontSize: { xs: '0.75rem', sm: '0.85rem' }, fontWeight: 600, color: tierColor }}>{title}</Typography>
      </Box>
      <Typography sx={{ fontSize: { xs: '0.72rem', sm: '0.85rem' }, color: 'rgba(255,255,255,0.65)', fontVariantNumeric: 'tabular-nums' }}>{xp}</Typography>
      <Typography sx={{ fontSize: { xs: '0.72rem', sm: '0.85rem' }, color: GAIN_COLOR, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fee}</Typography>
      <Typography sx={{ fontSize: { xs: '0.72rem', sm: '0.85rem' }, color: ACCENT_COLOR, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{mult}</Typography>
    </Box>
  );
}

/* ── Level data ──────────────────────────────────────────────────────── */

const LEVELS = [
  { level: 1, title: 'Newcomer', xp: '0', fee: '5.00%', mult: '1.0x', icon: '/Level/Level_1-4.png', color: 'rgba(255,255,255,0.5)' },
  { level: 2, title: 'Newcomer', xp: '500', fee: '5.00%', mult: '1.0x', icon: '/Level/Level_1-4.png', color: 'rgba(255,255,255,0.5)' },
  { level: 3, title: 'Observer', xp: '2,241', fee: '5.00%', mult: '1.0x', icon: '/Level/Level_1-4.png', color: 'rgba(255,255,255,0.5)' },
  { level: 4, title: 'Observer', xp: '5,853', fee: '5.00%', mult: '1.0x', icon: '/Level/Level_1-4.png', color: 'rgba(255,255,255,0.5)' },
  { level: 5, title: 'Observer', xp: '11,915', fee: '4.75%', mult: '1.0x', icon: '/Level/Level_5-8.png', color: UP_COLOR },
  { level: 6, title: 'Speculator', xp: '20,974', fee: '4.75%', mult: '1.1x', icon: '/Level/Level_5-8.png', color: UP_COLOR },
  { level: 7, title: 'Speculator', xp: '33,552', fee: '4.75%', mult: '1.1x', icon: '/Level/Level_5-8.png', color: UP_COLOR },
  { level: 8, title: 'Speculator', xp: '50,153', fee: '4.75%', mult: '1.1x', icon: '/Level/Level_5-8.png', color: UP_COLOR },
  { level: 9, title: 'Analyst', xp: '71,265', fee: '4.75%', mult: '1.1x', icon: '/Level/Level_9-12.png', color: GAIN_COLOR },
  { level: 10, title: 'Analyst', xp: '97,362', fee: '4.50%', mult: '1.1x', icon: '/Level/Level_9-12.png', color: GAIN_COLOR },
  { level: 11, title: 'Analyst', xp: '128,909', fee: '4.50%', mult: '1.2x', icon: '/Level/Level_9-12.png', color: GAIN_COLOR },
  { level: 12, title: 'Trader', xp: '166,361', fee: '4.50%', mult: '1.2x', icon: '/Level/Level_9-12.png', color: GAIN_COLOR },
  { level: 13, title: 'Trader', xp: '210,163', fee: '4.50%', mult: '1.2x', icon: '/Level/Level_13-16.png', color: ACCENT_COLOR },
  { level: 14, title: 'Trader', xp: '260,753', fee: '4.50%', mult: '1.2x', icon: '/Level/Level_13-16.png', color: ACCENT_COLOR },
  { level: 15, title: 'Trader', xp: '318,562', fee: '4.25%', mult: '1.2x', icon: '/Level/Level_13-16.png', color: ACCENT_COLOR },
  { level: 16, title: 'Oracle', xp: '384,015', fee: '4.25%', mult: '1.35x', icon: '/Level/Level_13-16.png', color: ACCENT_COLOR },
  { level: 17, title: 'Oracle', xp: '457,531', fee: '4.25%', mult: '1.35x', icon: '/Level/Level_17-20.png', color: '#A78BFA' },
  { level: 18, title: 'Oracle', xp: '539,524', fee: '4.25%', mult: '1.35x', icon: '/Level/Level_17-20.png', color: '#A78BFA' },
  { level: 19, title: 'Oracle', xp: '630,402', fee: '4.25%', mult: '1.35x', icon: '/Level/Level_17-20.png', color: '#A78BFA' },
  { level: 20, title: 'Veteran', xp: '730,569', fee: '4.00%', mult: '1.35x', icon: '/Level/Level_17-20.png', color: '#A78BFA' },
  { level: 21, title: 'Veteran', xp: '840,425', fee: '4.00%', mult: '1.5x', icon: '/Level/Level_21-24.png', color: '#F472B6' },
  { level: 22, title: 'Veteran', xp: '960,365', fee: '4.00%', mult: '1.5x', icon: '/Level/Level_21-24.png', color: '#F472B6' },
  { level: 23, title: 'Veteran', xp: '1,090,780', fee: '4.00%', mult: '1.5x', icon: '/Level/Level_21-24.png', color: '#F472B6' },
  { level: 24, title: 'Expert', xp: '1,232,059', fee: '4.00%', mult: '1.5x', icon: '/Level/Level_21-24.png', color: '#F472B6' },
  { level: 25, title: 'Expert', xp: '1,384,587', fee: '3.75%', mult: '1.5x', icon: '/Level/Level_25-28.png', color: '#FB923C' },
  { level: 26, title: 'Expert', xp: '1,548,744', fee: '3.75%', mult: '1.7x', icon: '/Level/Level_25-28.png', color: '#FB923C' },
  { level: 27, title: 'Expert', xp: '1,724,909', fee: '3.75%', mult: '1.7x', icon: '/Level/Level_25-28.png', color: '#FB923C' },
  { level: 28, title: 'Legend', xp: '1,913,458', fee: '3.75%', mult: '1.7x', icon: '/Level/Level_25-28.png', color: '#FB923C' },
  { level: 29, title: 'Legend', xp: '2,114,762', fee: '3.75%', mult: '1.7x', icon: '/Level/Level_29-32.png', color: '#F43F5E' },
  { level: 30, title: 'Legend', xp: '2,329,192', fee: '3.50%', mult: '1.7x', icon: '/Level/Level_29-32.png', color: '#F43F5E' },
  { level: 31, title: 'Legend', xp: '2,557,115', fee: '3.50%', mult: '1.9x', icon: '/Level/Level_29-32.png', color: '#F43F5E' },
  { level: 32, title: 'Mythic', xp: '2,798,895', fee: '3.50%', mult: '1.9x', icon: '/Level/Level_29-32.png', color: '#F43F5E' },
  { level: 33, title: 'Mythic', xp: '3,054,895', fee: '3.50%', mult: '1.9x', icon: '/Level/Level_33-36.png', color: '#E879F9' },
  { level: 34, title: 'Mythic', xp: '3,325,474', fee: '3.50%', mult: '1.9x', icon: '/Level/Level_33-36.png', color: '#E879F9' },
  { level: 35, title: 'Titan', xp: '3,610,991', fee: '3.25%', mult: '1.9x', icon: '/Level/Level_33-36.png', color: '#E879F9' },
  { level: 36, title: 'Titan', xp: '3,911,801', fee: '3.25%', mult: '2.0x', icon: '/Level/Level_33-36.png', color: '#E879F9' },
  { level: 37, title: 'Immortal', xp: '4,228,257', fee: '3.25%', mult: '2.0x', icon: '/Level/Level_37-40.png', color: '#FACC15' },
  { level: 38, title: 'Immortal', xp: '4,560,712', fee: '3.25%', mult: '2.0x', icon: '/Level/Level_37-40.png', color: '#FACC15' },
  { level: 39, title: 'Paragon', xp: '4,909,515', fee: '3.25%', mult: '2.0x', icon: '/Level/Level_37-40.png', color: '#FACC15' },
  { level: 40, title: 'Apex Legend', xp: '5,275,014', fee: '3.00%', mult: '2.0x', icon: '/Level/Level_37-40.png', color: '#FACC15' },
];

/* ── Token chart data ─────────────────────────────────────────────────── */

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

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function DocsPage() {
  return (
    <AppShell>
      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 }, pb: { xs: 6, md: 8 } }}>

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <Box sx={{ textAlign: 'center', mb: 5, mt: { xs: 1, md: 2 } }}>
          <Box component="img" src="/updown-logos/Logo_text_white_796x277.png" alt="UpDown" sx={{ height: { xs: 36, md: 48 }, mb: 2 }} />
          <Typography sx={{ fontSize: { xs: '0.85rem', md: '1rem' }, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
            Predict crypto prices. Stake USDC. Win the pool.
          </Typography>
        </Box>

        {/* ── Index ─────────────────────────────────────────────────── */}
        <Box sx={{ bgcolor: '#0D1219', p: { xs: 2, md: 3 }, mb: 4 }}>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', mb: 2 }}>
            Contents
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 0.5 }}>
            {[
              { label: 'Getting Started', href: '#quick-start', color: UP_COLOR },
              { label: 'Pool Lifecycle', href: '#how-pools-work', color: ACCENT_COLOR },
              { label: 'Assets & Timeframes', href: '#assets-timeframes', color: GAIN_COLOR },
              { label: 'Odds & Payouts', href: '#odds-payouts', color: '#A78BFA' },
              { label: 'Claiming Payouts', href: '#claiming', color: '#F472B6' },
              { label: 'Referral Program', href: '#referrals', color: '#22C55E' },
              { label: 'XP & Rewards', href: '#xp-rewards', color: '#FB923C' },
              { label: 'Level Progression', href: '#levels', color: '#E879F9' },
              { label: 'UP Coins', href: '#up-coins', color: '#FACC15' },
              { label: 'UP Token Tokenomics', href: '#tokenomics', color: '#FACC15' },
              { label: 'Security & Transparency', href: '#security', color: '#38BDF8' },
              { label: 'Features', href: '#features', color: UP_COLOR },
              { label: 'Tips', href: '#tips', color: GAIN_COLOR },
            ].map((item) => (
              <Box
                key={item.href}
                component="a"
                href={item.href}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  textDecoration: 'none',
                  transition: 'background 0.15s ease',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                }}
              >
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: item.color, flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>{item.label}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* ── Quick Start (How-to-Play card style) ──────────────────── */}
        <SectionTitle id="quick-start">Getting Started</SectionTitle>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px', mb: 2 }}>
          <StepCard step={1} title="Connect Wallet" desc="Click Connect Wallet. Choose embedded (no extension) or external (Phantom, Solflare)." color={UP_COLOR} />
          <StepCard step={2} title="Fund Your Wallet" desc="Deposit USDC (Solana) into your wallet. You need USDC to place predictions and a small amount of SOL for transaction fees." color="#F472B6" />
          <StepCard step={3} title="Pick a Pool" desc="Browse Markets. Pools marked JOINING are open for predictions." color={ACCENT_COLOR} />
          <StepCard step={4} title="Predict UP or DOWN" desc="Toggle your side, enter USDC stake, confirm the transaction." color={GAIN_COLOR} />
          <StepCard step={5} title="Wait for Result" desc="Pool locks (ACTIVE) and resolves after 3 min – 1 hour." color="#A78BFA" />
          <StepCard step={6} title="Claim Winnings" desc="Go to Profile > Resolved tab, click Claim Payout. UP Coins and XP are awarded on claim." color="#FACC15" />
        </Box>

        {/* ── Pool Lifecycle ────────────────────────────────────────── */}
        <SectionTitle id="how-pools-work">Pool Lifecycle</SectionTitle>
        <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
          A <strong style={{ color: '#fff' }}>strike price</strong> is captured when the pool opens. A <strong style={{ color: '#fff' }}>final price</strong> when it ends.
          If final &gt; strike, <strong style={{ color: UP_COLOR }}>UP wins</strong>. If lower, <strong style={{ color: DOWN_COLOR }}>DOWN wins</strong>.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: '3px', mb: 2 }}>
          {[
            { label: 'JOINING', desc: 'Place predictions', icon: <HourglassTop sx={{ fontSize: 16 }} />, color: ACCENT_COLOR },
            { label: 'ACTIVE', desc: 'Bets locked', icon: <Bolt sx={{ fontSize: 16 }} />, color: UP_COLOR },
            { label: 'RESOLVED', desc: 'Winner decided', icon: <CheckCircle sx={{ fontSize: 16 }} />, color: '#A78BFA' },
            { label: 'CLAIMABLE', desc: 'Claim payouts', icon: <Star sx={{ fontSize: 16 }} />, color: GAIN_COLOR },
          ].map((s) => (
            <Box key={s.label} sx={{ bgcolor: `${s.color}08`, p: { xs: 1.25, md: 2 }, display: 'flex', flexDirection: 'column', gap: 0.5, borderBottom: `2px solid ${s.color}` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ color: s.color }}>{s.icon}</Box>
                <Typography sx={{ fontSize: { xs: '0.72rem', md: '0.85rem' }, fontWeight: 700, color: s.color, letterSpacing: '0.08em' }}>{s.label}</Typography>
              </Box>
              <Typography sx={{ fontSize: { xs: '0.78rem', md: '0.88rem' }, color: 'rgba(255,255,255,0.6)' }}>{s.desc}</Typography>
            </Box>
          ))}
        </Box>

        {/* ── Assets & Timeframes ───────────────────────────────────── */}
        <SectionTitle id="assets-timeframes">Assets & Timeframes</SectionTitle>
        <Box sx={{ bgcolor: '#0D1219', p: { xs: 2, md: 3 }, mb: 2 }}>
          {/* Assets */}
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 2 }}>ASSETS</Typography>
          <Box sx={{ display: 'flex', gap: { xs: 2, md: 4 }, mb: 3, justifyContent: 'center' }}>
            {['BTC', 'ETH', 'SOL'].map((a) => (
              <Box key={a} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <AssetIcon asset={a} size={48} />
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>{a}</Typography>
              </Box>
            ))}
          </Box>
          {/* Intervals */}
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

        {/* ── Odds & Payouts ────────────────────────────────────────── */}
        <SectionTitle id="odds-payouts">Odds & Payouts</SectionTitle>
        <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
          <strong style={{ color: '#fff' }}>Parimutuel</strong>: winners split the entire pool proportionally. Odds update in real-time as bets come in.
        </Typography>

        {/* Arena-style example */}
        <Box sx={{ display: 'flex', gap: '3px', mb: 2 }}>
          <Box sx={{ flex: 1, background: `linear-gradient(135deg, ${UP_COLOR}15, ${UP_COLOR}05)`, p: 2, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <Img src="/assets/up-icon-64x64.png" size={36} alt="UP" />
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>UP POOL</Typography>
            <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, color: UP_COLOR }}>$100</Typography>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: UP_COLOR }}>1.50x</Typography>
          </Box>
          <Box sx={{ flex: 1, background: `linear-gradient(135deg, ${DOWN_COLOR}05, ${DOWN_COLOR}15)`, p: 2, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <Img src="/assets/down-icon-64x64.png" size={36} alt="DOWN" />
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>DOWN POOL</Typography>
            <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, color: DOWN_COLOR }}>$50</Typography>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: DOWN_COLOR }}>3.00x</Typography>
          </Box>
        </Box>

        {/* Payout breakdown (BetForm style) */}
        <Box sx={{ bgcolor: '#0D1219', borderTop: `1px solid ${GAIN_COLOR}30`, mb: 2 }}>
          <DataRow label="Your Stake" value="$100 on UP" />
          <DataRow label="Odds" value="1.50x" color={UP_COLOR} />
          <DataRow label="Gross Payout" value="$150.00" />
          <DataRow label="Platform Fee (5%)" value="-$7.50" color={DOWN_COLOR} />
          <DataRow label="You Receive" value="$142.50" color={GAIN_COLOR} bold />
        </Box>

        <Box sx={{ bgcolor: `${ACCENT_COLOR}10`, borderLeft: `3px solid ${ACCENT_COLOR}`, px: 2, py: 1.5, borderRadius: '0 4px 4px 0', mb: 2 }}>
          <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
            If a pool is one-sided (everyone bet the same direction), all bets are <strong style={{ color: '#fff' }}>refunded</strong>.
          </Typography>
        </Box>

        {/* ── Claiming ──────────────────────────────────────────────── */}
        <SectionTitle id="claiming">Claiming Payouts</SectionTitle>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: '3px', mb: 2 }}>
          {[
            { title: 'From Profile', desc: 'Go to /profile > Resolved tab > Claim Payout', color: UP_COLOR },
            { title: 'Claim All', desc: 'Multiple wins? Use the Claim All banner to batch-claim', color: GAIN_COLOR },
            { title: 'From Pool', desc: 'Open the resolved pool and claim directly', color: ACCENT_COLOR },
          ].map((c) => (
            <Box key={c.title} sx={{ bgcolor: '#0D1219', p: 2, borderTop: `2px solid ${c.color}` }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, mb: 0.5 }}>{c.title}</Typography>
              <Typography sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{c.desc}</Typography>
            </Box>
          ))}
        </Box>

        {/* ── Referral Program ─────────────────────────────────────── */}
        <SectionTitle id="referrals">Referral Program</SectionTitle>
        <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
          Invite friends and earn <strong style={{ color: GAIN_COLOR }}>1% of their bet amounts</strong> as commission every time a pool resolves normally. No extra cost to them.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px', mb: 2 }}>
          <StepCard step={1} title="Share Your Link" desc="Go to Referrals page or click the share icon on your profile. Copy your unique referral link." color={UP_COLOR} />
          <StepCard step={2} title="Friend Opens Link" desc="They open the link. If not connected, a banner shows they were invited. Once they connect, a dialog asks them to accept." color={ACCENT_COLOR} />
          <StepCard step={3} title="They Play" desc="Your friend places bets normally. Every time a pool they bet in resolves (not a refund), you earn 1% of their bet amount." color={GAIN_COLOR} />
          <StepCard step={4} title="Claim Earnings" desc="Go to Referrals page. When your unpaid balance reaches $1, click Claim. USDC is sent directly to your wallet on-chain." color="#A78BFA" />
        </Box>

        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>HOW IT WORKS</Typography>
        <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
          <DataRow label="Referrer reward on accept" value="+500 XP + 50 UP Coins" color={ACCENT_COLOR} bold />
          <DataRow label="Commission rate" value="1% of bet amount" color={GAIN_COLOR} bold />
          <DataRow label="When earned" value="Pool resolves normally" />
          <DataRow label="Refunded pools" value="No commission" color={DOWN_COLOR} />
          <DataRow label="Minimum claim" value="$1.00 USDC" />
          <DataRow label="Payout method" value="USDC transfer on-chain" color={UP_COLOR} />
          <DataRow label="Self-referral" value="Blocked" color={DOWN_COLOR} />
        </Box>

        <Box sx={{ bgcolor: `${GAIN_COLOR}10`, borderLeft: `3px solid ${GAIN_COLOR}`, px: 2, py: 1.5, borderRadius: '0 4px 4px 0', mb: 2 }}>
          <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
            <strong style={{ color: GAIN_COLOR }}>Example:</strong> Your friend bets $100 on a pool. The pool resolves with a winner. You earn <strong style={{ color: '#fff' }}>$1.00 USDC</strong> — regardless of whether your friend won or lost.
          </Typography>
        </Box>

        {/* ── XP System ─────────────────────────────────────────────── */}
        <SectionTitle id="xp-rewards">XP & Rewards</SectionTitle>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: '3px', mb: 2 }}>
          <InfoCard icon={<Bolt sx={{ fontSize: 14, color: UP_COLOR }} />} label="BET PLACED" value="+100 XP" color={UP_COLOR} />
          <InfoCard icon={<Star sx={{ fontSize: 14, color: ACCENT_COLOR }} />} label="DAILY FIRST BET" value="+200 XP" color={ACCENT_COLOR} />
          <InfoCard icon={<EmojiEvents sx={{ fontSize: 14, color: GAIN_COLOR }} />} label="BET WON" value="+150 XP" color={GAIN_COLOR} />
          <InfoCard icon={<CheckCircle sx={{ fontSize: 14, color: '#A78BFA' }} />} label="CLAIM COMPLETED" value="+50 XP" color="#A78BFA" />
        </Box>

        {/* Win streak XP */}
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>WIN STREAK XP BONUS</Typography>
        <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
          <DataRow label="3 consecutive wins" value="+100 XP" color={GAIN_COLOR} />
          <DataRow label="4 consecutive wins" value="+200 XP" color={GAIN_COLOR} />
          <DataRow label="5 consecutive wins" value="+300 XP" color={GAIN_COLOR} />
          <DataRow label="10+ consecutive wins (cap)" value="+800 XP" color={GAIN_COLOR} bold />
        </Box>
        <Box sx={{ bgcolor: `${DOWN_COLOR}10`, borderLeft: `3px solid ${DOWN_COLOR}`, px: 2, py: 1.5, borderRadius: '0 4px 4px 0', mb: 2 }}>
          <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.75)' }}>
            Streak resets to 0 on any loss. Formula: <strong style={{ color: '#fff' }}>+100 x (streak - 2)</strong>, capped at streak 10.
          </Typography>
        </Box>

        {/* ── Level Progression ─────────────────────────────────────── */}
        <SectionTitle id="levels">Level Progression (1–40)</SectionTitle>
        <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
          Higher levels unlock lower fees and higher coin multipliers. XP curve: <strong style={{ color: '#fff' }}>500 x (level - 1)^1.8</strong> per level.
        </Typography>

        {/* Level table header */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '40px 1fr 1fr 48px 48px', sm: '50px 1fr 1fr 60px 60px', md: '60px 1.2fr 1.2fr 100px 100px' },
            py: 1,
            px: { xs: 0.75, sm: 1.5 },
            bgcolor: '#0D1219',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
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

        {/* ── UP Coins ──────────────────────────────────────────────── */}
        <SectionTitle id="up-coins">
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <Img src="/token/Token_16px_Gold.png" size={16} alt="UP Coin" />
            UP Coins
          </Box>
        </SectionTitle>
        <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
          Coins are <strong style={{ color: '#fff' }}>only awarded when you claim</strong> a winning bet, never at deposit time.
        </Typography>

        {/* Coin sources */}
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>EARNING SOURCES</Typography>
        <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
          <DataRow label="Base bet coins" value="$amount x 0.10 UP x level mult" />
          <DataRow label="Win bonus" value="50% of base x level mult" color={GAIN_COLOR} />
          <DataRow label="Streak bonus (3+ wins)" value="min(streak x 2.00, 20.00) UP" color={ACCENT_COLOR} />
          <DataRow label="Level-up bonus" value="newLevel x 5.00 UP" color="#A78BFA" />
        </Box>

        {/* Coin example */}
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>EXAMPLE: $10 BET AT LEVEL 20 (1.35x MULT)</Typography>
        <Box sx={{ bgcolor: '#0D1219', borderTop: `1px solid ${ACCENT_COLOR}30`, mb: 2 }}>
          <DataRow label="Base coins" value="+1.35 UP" color={ACCENT_COLOR} />
          <DataRow label="Win bonus" value="+0.67 UP" color={GAIN_COLOR} />
          <DataRow label="Total per win" value="+2.02 UP" color="#fff" bold />
        </Box>

        {/* Daily limits */}
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>DAILY LIMITS</Typography>
        <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
          <DataRow label="Daily cap per wallet" value="500 UP max" color={DOWN_COLOR} bold />
          <DataRow label="Minimum bet for coins" value="$1 USDC" />
          <DataRow label="Bets 1–20 / day" value="100% rate" color={GAIN_COLOR} />
          <DataRow label="Bets 21–40 / day" value="50% rate" color={ACCENT_COLOR} />
          <DataRow label="Bets 41+ / day" value="0%, no coins" color={DOWN_COLOR} />
        </Box>

        {/* ── UP Token Tokenomics ──────────────────────────────────── */}
        <SectionTitle id="tokenomics">
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <Img src="/token/Token_16px_Gold.png" size={16} alt="UP Token" />
            UP Token Tokenomics
          </Box>
        </SectionTitle>
        <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
          The <strong style={{ color: '#FACC15' }}>UP Token</strong> is the native cryptocurrency of UpDown, built on <strong style={{ color: '#fff' }}>Solana (SPL)</strong>.
          UP Coins earned in-app will convert to UP Tokens at launch, rewarding early players.
        </Typography>

        {/* Token overview cards */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: '3px', mb: 2 }}>
          <InfoCard icon={<Img src="/token/Token_16px_Gold.png" size={14} alt="UP" />} label="TOTAL SUPPLY" value="10,000,000,000" color="#FACC15" />
          <InfoCard icon={<Bolt sx={{ fontSize: 14, color: '#A78BFA' }} />} label="BLOCKCHAIN" value="Solana (SPL)" color="#A78BFA" />
          <InfoCard icon={<Star sx={{ fontSize: 14, color: GAIN_COLOR }} />} label="TICKER" value="$UP" color={GAIN_COLOR} />
          <InfoCard icon={<CheckCircle sx={{ fontSize: 14, color: UP_COLOR }} />} label="DECIMALS" value="6" color={UP_COLOR} />
        </Box>

        {/* Token Distribution: Donut Chart + Legend */}
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
              <Tooltip
                key={a.label}
                title={`${a.tokens} UP - ${a.desc}`}
                placement="left"
                arrow
                slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.78rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', py: 0.25, mx: -0.5, px: 0.5, borderRadius: '4px', transition: 'background 0.15s', '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' } }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: a.color, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: { xs: '0.82rem', md: '0.88rem' }, fontWeight: 600, color: a.color, flex: 1, minWidth: 0 }}>{a.label}</Typography>
                  <Typography sx={{ fontSize: { xs: '0.82rem', md: '0.88rem' }, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{a.pct}%</Typography>
                </Box>
              </Tooltip>
            ))}
          </Box>
        </Box>

        {/* Vesting Timeline */}
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1, mt: 2 }}>VESTING SCHEDULE</Typography>
        <Box sx={{ bgcolor: '#0D1219', p: { xs: 1.5, md: 2.5 }, mb: '3px' }}>
          {/* Month markers */}
          <Box sx={{ display: 'flex', ml: { xs: '65px', sm: '80px', md: '100px' }, mr: { xs: '70px', sm: '90px', md: '120px' }, mb: 1 }}>
            {[0, 6, 12, 18, 24, 30].map((m) => (
              <Typography key={m} sx={{ fontSize: { xs: '0.58rem', md: '0.68rem' }, color: 'rgba(255,255,255,0.3)', flex: 1 }}>
                {m === 0 ? 'TGE' : `${m}mo`}
              </Typography>
            ))}
          </Box>
          {/* Bars */}
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
                    <Box sx={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${(v.cliff / VESTING_MAX) * 100}%`,
                      bgcolor: `${v.color}10`,
                      borderRight: `1px dashed ${v.color}50`,
                    }} />
                  )}
                  <Box sx={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${(v.cliff / VESTING_MAX) * 100}%`,
                    width: `${((v.end - v.cliff) / VESTING_MAX) * 100}%`,
                    background: `linear-gradient(90deg, ${v.color}90, ${v.color}50)`,
                    borderRadius: '3px',
                  }} />
                </Box>
                <Typography sx={{ fontSize: { xs: '0.55rem', md: '0.68rem' }, color: 'rgba(255,255,255,0.4)', width: { xs: 65, sm: 80, md: 110 }, flexShrink: 0 }}>{v.note}</Typography>
              </Box>
            </Tooltip>
          ))}
        </Box>

        {/* Token Utility */}
        <Box sx={{ bgcolor: '#0D1219', p: { xs: 1.5, md: 2 }, mb: 2 }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>TOKEN UTILITY</Typography>
          {[
            { title: 'Fee Discounts', desc: 'Pay platform fees in $UP for up to 50% additional discount on top of level-based reductions.', color: GAIN_COLOR },
            { title: 'Staking Rewards', desc: 'Stake $UP to earn a share of platform fee revenue, distributed weekly.', color: UP_COLOR },
            { title: 'Governance', desc: 'Vote on new assets, timeframes, fee parameters, and treasury allocation.', color: ACCENT_COLOR },
            { title: 'Exclusive Pools', desc: 'Access high-stakes and special event pools by holding minimum $UP balance.', color: '#A78BFA' },
            { title: 'Boosted Earnings', desc: 'Burn $UP to activate temporary 2x coin multiplier on top of level multiplier.', color: '#FACC15' },
          ].map((u) => (
            <Box key={u.title} sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'flex-start' }}>
              <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: u.color, mt: 0.8, flexShrink: 0 }} />
              <Box>
                <Typography sx={{ fontSize: { xs: '0.85rem', md: '0.9rem' }, fontWeight: 700, color: u.color }}>{u.title}</Typography>
                <Typography sx={{ fontSize: { xs: '0.82rem', md: '0.88rem' }, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{u.desc}</Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* Coins to Token conversion */}
        <Box sx={{ bgcolor: `${GAIN_COLOR}10`, borderLeft: `3px solid ${GAIN_COLOR}`, px: 2, py: 1.5, borderRadius: '0 4px 4px 0', mb: 2 }}>
          <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
            <strong style={{ color: GAIN_COLOR }}>Early Player Advantage:</strong> UP Coins earned now will convert to $UP tokens at launch.
            The earlier you play, the more tokens you accumulate before public availability.
          </Typography>
        </Box>

        {/* Ecosystem flywheel */}
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>ECOSYSTEM</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px', mb: 2 }}>
          {[
            { step: 'Play', desc: 'Place predictions on BTC, ETH, SOL price movements', color: UP_COLOR },
            { step: 'Earn', desc: 'Win pools, earn UP Coins + XP, level up, lower fees & higher multipliers', color: GAIN_COLOR },
            { step: 'Convert', desc: 'UP Coins convert to $UP tokens at Token Generation Event (TGE)', color: '#FACC15' },
            { step: 'Stake', desc: 'Stake $UP to earn platform fee revenue share', color: ACCENT_COLOR },
            { step: 'Govern', desc: 'Use $UP to vote on protocol upgrades and new features', color: '#A78BFA' },
          ].map((e, i) => (
            <Box key={e.step} sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.5, bgcolor: `${e.color}08`, borderLeft: `3px solid ${e.color}` }}>
              <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: `${e.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: e.color }}>{i + 1}</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: e.color }}>{e.step}</Typography>
                <Typography sx={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.6)' }}>{e.desc}</Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* ── Security & Transparency ─────────────────────────────── */}
        <SectionTitle id="security">Security & Transparency</SectionTitle>
        <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
          Every pool, deposit, payout and refund happens on the <strong style={{ color: '#fff' }}>Solana blockchain</strong>.
          All transactions are public and verifiable by anyone.
        </Typography>

        {/* How it works flow */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px', mb: 2 }}>
          {[
            {
              icon: <AccountBalanceWallet sx={{ fontSize: 20 }} />,
              title: 'Wallet Connection via Privy',
              desc: 'UpDown uses Privy for secure wallet authentication. You can create an embedded wallet instantly (no browser extension needed) or connect an external wallet like Phantom. Privy handles key management with enterprise-grade security. UpDown never has access to your private keys.',
              color: '#38BDF8',
            },
            {
              icon: <Lock sx={{ fontSize: 20 }} />,
              title: 'Pool Creation (On-Chain)',
              desc: 'Each pool creates a unique Program Derived Address (PDA) and a vault token account on Solana. The vault can only be controlled by the smart contract, not by any person or server.',
              color: ACCENT_COLOR,
            },
            {
              icon: <ShowChart sx={{ fontSize: 20 }} />,
              title: 'Market Data by Pacifica',
              desc: 'All price data (live charts, candles, strike and final prices) comes from Pacifica (pacifica.fi), a professional-grade market data provider. Strike price is captured when the pool opens, final price when it closes. Both are written on-chain and publicly verifiable.',
              color: UP_COLOR,
            },
            {
              icon: <SwapHoriz sx={{ fontSize: 20 }} />,
              title: 'Deposits',
              desc: 'When you bet, your USDC is transferred directly from your wallet to the on-chain vault via a Solana transaction that only you sign. The platform never holds your funds in a centralized account.',
              color: GAIN_COLOR,
            },
            {
              icon: <Gavel sx={{ fontSize: 20 }} />,
              title: 'Resolution',
              desc: 'After the pool ends, the smart contract compares final price vs strike price. If final > strike, UP wins. If lower, DOWN wins. The result is recorded on-chain permanently.',
              color: '#A78BFA',
            },
            {
              icon: <Verified sx={{ fontSize: 20 }} />,
              title: 'Payouts & Claims',
              desc: 'Winnings are calculated by the formula: (your bet x total pool) / winning side total. The smart contract transfers USDC directly from the vault to your wallet. Fees are level-based (5% to 3%) and deducted transparently.',
              color: '#F472B6',
            },
            {
              icon: <Shield sx={{ fontSize: 20 }} />,
              title: 'Refunds',
              desc: 'One-sided pools (everyone bet the same direction) are automatically refunded in full, no fees. The smart contract handles refunds without requiring any action from you.',
              color: '#FACC15',
            },
          ].map((item) => (
            <Box
              key={item.title}
              sx={{
                display: 'flex',
                gap: 1.5,
                px: { xs: 1.5, md: 2.5 },
                py: { xs: 1.5, md: 2 },
                bgcolor: '#0D1219',
                transition: 'background 0.15s ease',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
              }}
            >
              <Box sx={{ color: item.color, mt: 0.25, flexShrink: 0 }}>{item.icon}</Box>
              <Box>
                <Typography sx={{ fontSize: { xs: '0.88rem', md: '0.95rem' }, fontWeight: 700, mb: 0.25, color: item.color }}>{item.title}</Typography>
                <Typography sx={{ fontSize: { xs: '0.82rem', md: '0.9rem' }, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{item.desc}</Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* On-chain architecture details */}
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>ON-CHAIN ARCHITECTURE</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: '3px', mb: 2 }}>
          <Box sx={{ bgcolor: '#0D1219', p: { xs: 1.5, md: 2 } }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#38BDF8', letterSpacing: '0.08em', mb: 1 }}>SMART CONTRACT</Typography>
            <DataRow label="Blockchain" value="Solana" color="#38BDF8" />
            <DataRow label="Framework" value="Anchor (Rust)" />
            <DataRow label="Token" value="USDC (SPL)" color={GAIN_COLOR} />
            <DataRow label="Vault type" value="PDA Token Account" />
            <DataRow label="Vault authority" value="Program only" color={ACCENT_COLOR} />
          </Box>
          <Box sx={{ bgcolor: '#0D1219', p: { xs: 1.5, md: 2 } }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#38BDF8', letterSpacing: '0.08em', mb: 1 }}>WHAT LIVES ON-CHAIN</Typography>
            <DataRow label="Pool data" value="PDA per pool" />
            <DataRow label="Bet records" value="PDA per user per pool" />
            <DataRow label="USDC vault" value="PDA token account" />
            <DataRow label="Strike & final price" value="Stored on pool PDA" />
            <DataRow label="Winner side" value="Written at resolution" color={GAIN_COLOR} />
          </Box>
        </Box>

        {/* Transaction signing */}
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>WHO SIGNS WHAT</Typography>
        <Box sx={{ bgcolor: '#0D1219', mb: 2 }}>
          <DataRow label="Deposit" value="You sign" color={UP_COLOR} />
          <DataRow label="Claim payout" value="You + Platform co-sign" color={GAIN_COLOR} />
          <DataRow label="Pool resolution" value="Platform signs" color={ACCENT_COLOR} />
          <DataRow label="Refund" value="Platform signs (automatic)" color="#FACC15" />
        </Box>

        <Box sx={{ bgcolor: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid #38BDF8', px: 2, py: 1.5, borderRadius: '0 4px 4px 0', mb: 2 }}>
          <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
            <strong style={{ color: '#38BDF8' }}>Fully verifiable:</strong> every transaction can be inspected on Solana Explorer.
            The vault is controlled exclusively by the smart contract. No person or server can move funds without the correct on-chain conditions being met.
          </Typography>
        </Box>

        {/* ── Features ──────────────────────────────────────────────── */}
        <SectionTitle id="features">Features</SectionTitle>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: '3px', mb: 2 }}>
          {[
            { icon: <ShowChart sx={{ fontSize: 20 }} />, title: 'Markets Page', desc: 'Filter by status (All/Joining/Active), asset (BTC/ETH/SOL), and interval (3m/5m/15m/1h). Filters saved in URL.', color: UP_COLOR },
            { icon: <Img src="/assets/market-battle-icon-500.png" size={22} alt="Pool" />, title: 'Pool Detail', desc: 'Live price, strike vs final, UP/DOWN arena, bet form with presets, payout preview, price chart.', color: ACCENT_COLOR },
            { icon: <WorkOutline sx={{ fontSize: 20 }} />, title: 'Profile', desc: 'Stats, level badge, XP progress, USDC & UP Coins balance, bet history in Active/Resolved/Claimed tabs.', color: '#A78BFA' },
            { icon: <EmojiEvents sx={{ fontSize: 20 }} />, title: 'Leaderboard', desc: 'Rankings by Top XP, Top Coins, or Top Level. Gold/Silver/Bronze medals for top 3.', color: GAIN_COLOR },
            { icon: <SmartToy sx={{ fontSize: 20 }} />, title: 'AI Analyzer Bot', desc: 'Draggable bot on pool pages. RSI, MACD, EMA, Bollinger analysis. Chat, voice mode, post-mortem.', color: '#E879F9' },
            { icon: <Notifications sx={{ fontSize: 20 }} />, title: 'Notifications', desc: 'Real-time alerts for wins, losses, claims, XP/coins earned, level ups, and refunds.', color: '#FACC15' },
          ].map((f) => (
            <Box
              key={f.title}
              sx={{
                bgcolor: '#0D1219',
                p: 2,
                display: 'flex',
                gap: 1.5,
                transition: 'background 0.15s ease',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
              }}
            >
              <Box sx={{ color: f.color, mt: 0.25, flexShrink: 0 }}>{f.icon}</Box>
              <Box>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5 }}>{f.title}</Typography>
                <Typography sx={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{f.desc}</Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* ── Tips ───────────────────────────────────────────────────── */}
        <SectionTitle id="tips">Tips</SectionTitle>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {[
            { tip: 'Start small, $10-$50 bets to learn how odds shift.', color: UP_COLOR },
            { tip: 'Watch the odds. Early bets on the minority side get better multipliers.', color: ACCENT_COLOR },
            { tip: 'Level up! Fees drop from 5.00% to 3.00% and coin multiplier goes up to 2.0x.', color: GAIN_COLOR },
            { tip: 'Use the AI Bot on pool detail pages for technical analysis.', color: '#A78BFA' },
            { tip: 'Claim promptly. Don\'t forget winning bets in Profile > Resolved.', color: '#FACC15' },
          ].map((t, i) => (
            <Box key={i} sx={{ bgcolor: `${t.color}08`, borderLeft: `3px solid ${t.color}`, px: 2, py: 1.5 }}>
              <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
                <strong style={{ color: t.color }}>#{i + 1}</strong> {t.tip}
              </Typography>
            </Box>
          ))}
        </Box>

      </Container>
    </AppShell>
  );
}
