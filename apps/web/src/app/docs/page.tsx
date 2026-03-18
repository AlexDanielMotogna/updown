'use client';

import { Box, Container, Typography } from '@mui/material';
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
        px: 1.5,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <Typography sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.65)' }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.9rem', fontWeight: bold ? 700 : 500, color: color || '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
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
        gridTemplateColumns: { xs: '50px 1fr 1fr 60px 60px', md: '60px 1.2fr 1.2fr 100px 100px' },
        alignItems: 'center',
        py: 1,
        px: 1.5,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
        transition: 'background 0.15s ease',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box component="img" src={icon} alt={`Lv.${level}`} sx={{ width: 22, height: 22 }} />
        <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: tierColor }}>{level}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: tierColor }}>{title}</Typography>
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.65)', fontVariantNumeric: 'tabular-nums' }}>{xp}</Typography>
      <Typography sx={{ fontSize: '0.85rem', color: GAIN_COLOR, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fee}</Typography>
      <Typography sx={{ fontSize: '0.85rem', color: ACCENT_COLOR, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{mult}</Typography>
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
              { label: 'XP & Rewards', href: '#xp-rewards', color: '#FB923C' },
              { label: 'Level Progression', href: '#levels', color: '#E879F9' },
              { label: 'UP Coins', href: '#up-coins', color: '#FACC15' },
              { label: 'UP Token — Tokenomics', href: '#tokenomics', color: '#FACC15' },
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
          <StepCard step={5} title="Wait for Result" desc="Pool locks (ACTIVE) and resolves after 1 min – 1 hour." color="#A78BFA" />
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
            <Box key={s.label} sx={{ bgcolor: `${s.color}08`, p: 2, display: 'flex', flexDirection: 'column', gap: 0.5, borderBottom: `2px solid ${s.color}` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ color: s.color }}>{s.icon}</Box>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: s.color, letterSpacing: '0.08em' }}>{s.label}</Typography>
              </Box>
              <Typography sx={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.6)' }}>{s.desc}</Typography>
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
              { key: '1m', img: '/assets/turbo-tag.png' },
              { key: '5m', img: '/assets/rapid-tag.png' },
              { key: '15m', img: '/assets/short-tag.png' },
              { key: '1h', img: '/assets/hourly-tag.png' },
            ].map((t) => (
              <Img key={t.key} src={t.img} size={120} alt={t.key} />
            ))}
          </Box>
        </Box>

        {/* ── Odds & Payouts ────────────────────────────────────────── */}
        <SectionTitle id="odds-payouts">Odds & Payouts</SectionTitle>
        <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', mb: 2, lineHeight: 1.6 }}>
          <strong style={{ color: '#fff' }}>Parimutuel</strong> — winners split the entire pool proportionally. Odds update in real-time as bets come in.
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
            gridTemplateColumns: { xs: '50px 1fr 1fr 60px 60px', md: '60px 1.2fr 1.2fr 100px 100px' },
            py: 1,
            px: 1.5,
            bgcolor: '#0D1219',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {['LVL', 'TITLE', 'TOTAL XP', 'FEE', 'COINS'].map((h) => (
            <Typography key={h} sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em' }}>{h}</Typography>
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
          Coins are <strong style={{ color: '#fff' }}>only awarded when you claim</strong> a winning bet — never at deposit time.
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
          <DataRow label="Bets 41+ / day" value="0% — no coins" color={DOWN_COLOR} />
        </Box>

        {/* ── UP Token Tokenomics ──────────────────────────────────── */}
        <SectionTitle id="tokenomics">
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <Img src="/token/Token_16px_Gold.png" size={16} alt="UP Token" />
            UP Token — Tokenomics
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

        {/* Token Distribution */}
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>TOKEN DISTRIBUTION</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '3px', mb: 2 }}>
          {/* Allocation bars */}
          <Box sx={{ bgcolor: '#0D1219', p: { xs: 2, md: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[
              { label: 'Play-to-Earn Rewards', pct: 40, tokens: '4,000,000,000', color: GAIN_COLOR, desc: 'Distributed to players through gameplay' },
              { label: 'Liquidity Pool', pct: 15, tokens: '1,500,000,000', color: UP_COLOR, desc: 'DEX liquidity on Raydium / Orca' },
              { label: 'Team & Development', pct: 15, tokens: '1,500,000,000', color: ACCENT_COLOR, desc: '24-month vesting, 6-month cliff' },
              { label: 'Treasury', pct: 10, tokens: '1,000,000,000', color: '#A78BFA', desc: 'Protocol growth & partnerships' },
              { label: 'Community & Airdrops', pct: 10, tokens: '1,000,000,000', color: '#F472B6', desc: 'Community initiatives & early adopters' },
              { label: 'Marketing', pct: 5, tokens: '500,000,000', color: '#FB923C', desc: 'Exchange listings, campaigns, KOLs' },
              { label: 'Advisors', pct: 5, tokens: '500,000,000', color: '#E879F9', desc: '18-month vesting, 3-month cliff' },
            ].map((a) => (
              <Box key={a.label}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography sx={{ fontSize: '0.88rem', fontWeight: 600, color: a.color }}>{a.label}</Typography>
                  <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{a.pct}%</Typography>
                </Box>
                <Box sx={{ width: '100%', height: 6, bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden' }}>
                  <Box sx={{ width: `${a.pct}%`, height: '100%', bgcolor: a.color, borderRadius: 1 }} />
                </Box>
                <Typography sx={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', mt: 0.25 }}>{a.tokens} UP — {a.desc}</Typography>
              </Box>
            ))}
          </Box>

          {/* Token details */}
          <Box sx={{ bgcolor: '#0D1219', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
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
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: u.color }}>{u.title}</Typography>
                    <Typography sx={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{u.desc}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>

            <Box sx={{ p: 2 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>VESTING SCHEDULE</Typography>
              <DataRow label="Play-to-Earn" value="Unlocked via gameplay" color={GAIN_COLOR} />
              <DataRow label="Liquidity" value="100% at TGE" color={UP_COLOR} />
              <DataRow label="Team" value="6mo cliff → 24mo linear" color={ACCENT_COLOR} />
              <DataRow label="Treasury" value="12mo linear unlock" color="#A78BFA" />
              <DataRow label="Community" value="Airdrop waves + campaigns" color="#F472B6" />
              <DataRow label="Marketing" value="Unlocked per milestone" color="#FB923C" />
              <DataRow label="Advisors" value="3mo cliff → 18mo linear" color="#E879F9" />
            </Box>
          </Box>
        </Box>

        {/* Coins → Token conversion */}
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
            { step: 'Earn', desc: 'Win pools → earn UP Coins + XP → level up → lower fees & higher multipliers', color: GAIN_COLOR },
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

        {/* ── Features ──────────────────────────────────────────────── */}
        <SectionTitle id="features">Features</SectionTitle>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: '3px', mb: 2 }}>
          {[
            { icon: <ShowChart sx={{ fontSize: 20 }} />, title: 'Markets Page', desc: 'Filter by status (All/Joining/Active), asset (BTC/ETH/SOL), and interval (1m/5m/15m/1h). Filters saved in URL.', color: UP_COLOR },
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
            { tip: 'Start small — $10–$50 bets to learn how odds shift.', color: UP_COLOR },
            { tip: 'Watch the odds — early bets on the minority side get better multipliers.', color: ACCENT_COLOR },
            { tip: 'Level up — fees drop from 5.00% to 3.00% and coin multiplier goes up to 2.0x.', color: GAIN_COLOR },
            { tip: 'Use the AI Bot on pool detail pages for technical analysis.', color: '#A78BFA' },
            { tip: 'Claim promptly — don\'t forget winning bets in Profile > Resolved.', color: '#FACC15' },
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
