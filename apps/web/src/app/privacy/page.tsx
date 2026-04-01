'use client';

import { Box, Container, Typography } from '@mui/material';
import { AppShell } from '@/components';
import { useThemeTokens } from '@/app/providers';

function SectionLabel({ children }: { children: React.ReactNode }) {
  const t = useThemeTokens();
  return (
    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: t.text.soft, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1.5, mt: 4, px: { xs: 1.5, sm: 0 } }}>
      {children}
    </Typography>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  const t = useThemeTokens();
  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, py: { xs: 1.25, sm: 1 }, px: { xs: 1, sm: 1.5 }, gap: { xs: 0.25, sm: 1 }, borderBottom: `1px solid ${t.border.subtle}` }}>
      <Typography sx={{ fontSize: { xs: '0.8rem', sm: '0.9rem' }, color: t.text.rich }}>{label}</Typography>
      <Typography sx={{ fontSize: { xs: '0.78rem', sm: '0.9rem' }, fontWeight: 500, color: t.text.vivid }}>{value}</Typography>
    </Box>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  const t = useThemeTokens();
  return (
    <Typography sx={{ fontSize: '0.9rem', color: t.text.rich, lineHeight: 1.7, mb: 1.5 }}>
      {children}
    </Typography>
  );
}

export default function PrivacyPage() {
  const t = useThemeTokens();
  return (
    <AppShell>
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 }, pb: { xs: 6, md: 8 }, px: { xs: 0, sm: 3, md: 3 } }}>

        <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, mb: 1, px: { xs: 1.5, sm: 0 } }}>
          Disclaimer & Privacy Policy
        </Typography>
        <Typography sx={{ fontSize: '0.82rem', color: t.text.quaternary, mb: 4, px: { xs: 1.5, sm: 0 } }}>
          Last updated: March 2026
        </Typography>

        {/* ── Disclaimer ──────────────────────────────────────────── */}
        <SectionLabel>Disclaimer</SectionLabel>

        <Box sx={{ bgcolor: t.bg.surfaceAlt, px: { xs: 2, md: 2.5 }, py: { xs: 2, md: 2.5 }, mb: 2 }}>
          <Paragraph>
            UpDown is a community-driven prediction platform built on the Solana blockchain. It is <strong style={{ color: t.text.primary }}>not</strong> a licensed gambling, betting, or trading platform. UpDown does not offer financial advice, investment services, or trading services of any kind.
          </Paragraph>
          <Paragraph>
            Participation in UpDown pools is entirely voluntary. Users interact directly with on-chain smart contracts on Solana. The platform acts as a neutral interface to these contracts and does not custody, control, or manage user funds at any point. All deposits, payouts, and refunds are executed by the smart contract.
          </Paragraph>
          <Paragraph>
            UpDown is an experimental community project within the Solana ecosystem. It is provided &ldquo;as is&rdquo; without warranties of any kind. Users participate at their own risk and are solely responsible for understanding and complying with the laws and regulations of their jurisdiction.
          </Paragraph>
          <Paragraph>
            By using UpDown, you acknowledge that:
          </Paragraph>
          <Box sx={{ pl: 2, mb: 1 }}>
            {[
              'You are not located in a jurisdiction where participation is prohibited.',
              'You understand the risks of interacting with blockchain smart contracts.',
              'You are not using the platform as a substitute for regulated financial services.',
              'Past results do not guarantee future outcomes.',
              'You are solely responsible for any taxes or obligations arising from your activity.',
            ].map((item, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, mb: 0.75 }}>
                <Typography sx={{ fontSize: '0.9rem', color: t.text.quaternary }}>{String.fromCharCode(97 + i)})</Typography>
                <Typography sx={{ fontSize: '0.9rem', color: t.text.rich, lineHeight: 1.7 }}>{item}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* ── Nature of the Platform ──────────────────────────────── */}
        <SectionLabel>Nature of the Platform</SectionLabel>

        <Box sx={{ bgcolor: t.bg.surfaceAlt, px: { xs: 2, md: 2.5 }, py: { xs: 2, md: 2.5 }, mb: 2 }}>
          <Paragraph>
            UpDown is a <strong style={{ color: t.text.primary }}>community prediction game</strong> where participants express opinions on the short-term price direction of cryptocurrency assets. It operates using a parimutuel pool model: participants on the winning side share the pool proportionally.
          </Paragraph>
          <Paragraph>
            The platform does not act as a counterparty to any prediction. There is no house edge — the platform fee (3-5% based on user level) is the only revenue. All funds flow between participants via smart contracts.
          </Paragraph>
          <Paragraph>
            UpDown does not facilitate the purchase, sale, or exchange of any securities, commodities, or financial instruments. USDC used on the platform is a stablecoin held in user wallets and transferred via on-chain smart contracts only when users explicitly sign transactions.
          </Paragraph>
        </Box>

        {/* ── Privacy Policy ──────────────────────────────────────── */}
        <SectionLabel>Privacy Policy</SectionLabel>

        <Box sx={{ bgcolor: t.bg.surfaceAlt, px: { xs: 2, md: 2.5 }, py: { xs: 2, md: 2.5 }, mb: 2 }}>
          <Paragraph>
            UpDown collects minimal data. We do <strong style={{ color: t.text.primary }}>not</strong> collect personal information such as names, emails, phone numbers, or physical addresses. No KYC is required.
          </Paragraph>

          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: t.text.soft, letterSpacing: '0.08em', mb: 1, mt: 2 }}>DATA WE STORE</Typography>
          <Box sx={{ mb: 1.5 }}>
            <DataRow label="Wallet address" value="Public Solana address used to connect" />
            <DataRow label="On-chain activity" value="Predictions, claims, pool interactions (public on Solana)" />
            <DataRow label="XP, level, coins" value="Gamification stats tied to wallet address" />
            <DataRow label="Referral relationships" value="Referrer and referred wallet addresses" />
            <DataRow label="Squad data" value="Squad names, membership, invite codes, chat messages" />
          </Box>

          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: t.text.soft, letterSpacing: '0.08em', mb: 1, mt: 2 }}>DATA WE DO NOT STORE</Typography>
          <Box sx={{ mb: 1.5 }}>
            <DataRow label="Private keys" value="Never. Managed by Privy or your external wallet." />
            <DataRow label="Personal identity" value="No KYC, no email, no name, no phone" />
            <DataRow label="IP addresses" value="Not logged or stored persistently" />
            <DataRow label="Cookies / tracking" value="No third-party analytics or ad trackers" />
            <DataRow label="Browsing history" value="Not collected" />
          </Box>

          <Paragraph>
            All on-chain data (transactions, pool states, token balances) is inherently public on the Solana blockchain and viewable by anyone via block explorers. Off-chain data (XP, chat messages, referral stats) is stored in our database and associated only with your wallet address — not with any personal identity.
          </Paragraph>
        </Box>

        {/* ── Wallet & Security ───────────────────────────────────── */}
        <SectionLabel>Wallet & Security</SectionLabel>

        <Box sx={{ bgcolor: t.bg.surfaceAlt, px: { xs: 2, md: 2.5 }, py: { xs: 2, md: 2.5 }, mb: 2 }}>
          <Paragraph>
            UpDown uses <strong style={{ color: t.text.primary }}>Privy</strong> for wallet authentication. Privy provides enterprise-grade key management for embedded wallets. If you use an external wallet (Phantom, Solflare, etc.), your keys remain entirely under your control.
          </Paragraph>
          <Paragraph>
            UpDown <strong style={{ color: t.text.primary }}>never</strong> has access to your private keys, seed phrases, or signing authority. Every transaction requires your explicit approval via wallet signature.
          </Paragraph>
          <Paragraph>
            Smart contract vaults (PDAs) that hold pool funds are controlled exclusively by the on-chain program. No person, server, or admin can unilaterally move funds from a vault.
          </Paragraph>
        </Box>

        {/* ── Contact ─────────────────────────────────────────────── */}
        <SectionLabel>Contact</SectionLabel>

        <Box sx={{ bgcolor: t.bg.surfaceAlt, px: { xs: 2, md: 2.5 }, py: { xs: 2, md: 2.5 } }}>
          <Paragraph>
            UpDown is an open community project. For questions, feedback, or concerns, reach us through our community channels or via the platform interface.
          </Paragraph>
        </Box>

      </Container>
    </AppShell>
  );
}
